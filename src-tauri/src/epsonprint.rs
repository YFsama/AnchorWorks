// Epson inkjet maintenance channel — WinSpool RAW jobs (Windows only).
//
// USB inkjet printers enumerate as USB printer-class devices handled by
// the OS spooler, not as serial ports, so the plotter's serial layer
// cannot reach them. A RAW spooler job is the documented two-way door:
// OpenPrinter → StartDocPrinter(datatype "RAW") → WritePrinter sends
// arbitrary bytes (ESC sequences), and ReadPrinter on the same job
// brings the printer's replies back on bidirectional models. This is
// how the maintenance dialog talks to Epson machines: query status,
// run head cleaning, nozzle checks, and send maintenance command
// templates the operator pastes in.
//
// Non-Windows builds compile the same commands; they return a clear
// error so the UI can explain instead of failing silently.

use serde::Serialize;

/// One installed printer as the spooler sees it. `is_epson` is a name
/// heuristic — the dialog still shows everything so operators can pick
/// a driver-renamed device.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterDescriptor {
    pub name: String,
    pub port: String,
    pub driver: String,
    pub is_epson: bool,
}

fn from_hex(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 {
        return Err("hex payload must have an even length".into());
    }
    (0..s.len() / 2)
        .map(|i| u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).map_err(|e| e.to_string()))
        .collect()
}

#[cfg(windows)]
mod imp {
    use super::PrinterDescriptor;
    use std::ffi::CStr;
    use std::ffi::CString;
    use std::os::raw::c_char;
    use std::thread::sleep;
    use std::time::{Duration, Instant};

    /// Enumerate locally installed + connected printers (level 2 info so
    /// the port and driver names come along for the UI).
    pub fn list_printers() -> Result<Vec<PrinterDescriptor>, String> {
        use winapi::um::winspool::{
            EnumPrintersA, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_2A,
        };

        unsafe {
            let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
            let mut needed: u32 = 0;
            let mut returned: u32 = 0;
            // First call sizes the buffer; ERROR_INSUFFICIENT_BUFFER is the
            // expected "success" path here.
            EnumPrintersA(
                flags,
                std::ptr::null_mut(),
                2,
                std::ptr::null_mut(),
                0,
                &mut needed,
                &mut returned,
            );
            if needed == 0 {
                return Ok(Vec::new());
            }
            let mut buf = vec![0u8; needed as usize];
            let ok = EnumPrintersA(
                flags,
                std::ptr::null_mut(),
                2,
                buf.as_mut_ptr(),
                buf.len() as u32,
                &mut needed,
                &mut returned,
            );
            if ok == 0 {
                return Err("EnumPrinters failed — the spooler may be busy.".into());
            }
            let infos = buf.as_ptr() as *const PRINTER_INFO_2A;
            let mut out = Vec::with_capacity(returned as usize);
            for i in 0..returned as usize {
                let info = &*infos.add(i);
                let name = cstr_to_string(info.pPrinterName);
                let driver = cstr_to_string(info.pDriverName);
                let port = cstr_to_string(info.pPortName);
                let is_epson = name.to_ascii_lowercase().contains("epson")
                    || driver.to_ascii_lowercase().contains("epson");
                out.push(PrinterDescriptor { name, port, driver, is_epson });
            }
            Ok(out)
        }
    }

    /// Borrow the spooler-owned C string — never free it.
    unsafe fn cstr_to_string(p: *mut c_char) -> String {
        if p.is_null() {
            String::new()
        } else {
            CStr::from_ptr(p).to_string_lossy().into_owned()
        }
    }

    /// One bidirectional RAW transaction: send `out`, then drain replies
    /// until `read_ms` of silence or `max_read` bytes.
    pub fn transact(printer: &str, out: &[u8], read_ms: u32, max_read: usize) -> Result<Vec<u8>, String> {
        self::script(printer, &[(out.to_vec(), read_ms)], max_read)
            .map(|mut replies| replies.swap_remove(0))
    }

    /// A scripted RAW job: write each step, then drain its replies before
    /// the next write, all inside ONE spooler job. This is what stateful
    /// exchanges need — e.g. the full IEEE 1284.4 handshake (enter D4,
    /// Init, OpenChannel, channel packets, Exit) must interleave writes
    /// and reads on the same open job.
    pub fn script(printer: &str, steps: &[(Vec<u8>, u32)], max_read: usize) -> Result<Vec<Vec<u8>>, String> {
        use winapi::um::winspool::{
            ClosePrinter, EndDocPrinter, OpenPrinterA, ReadPrinter, StartDocPrinterA,
            WritePrinter, DOC_INFO_1A,
        };

        unsafe {
            let name = CString::new(printer).map_err(|_| "printer name contains a NUL byte")?;
            let mut handle: winapi::um::winnt::HANDLE = std::ptr::null_mut();
            if OpenPrinterA(name.as_ptr() as *mut _, &mut handle, std::ptr::null_mut()) == 0 {
                return Err(format!(
                    "OpenPrinter(\"{printer}\") failed — is the printer installed and the spooler running?"
                ));
            }

            let doc = CString::new("AnchorWorks maintenance").unwrap();
            let raw = CString::new("RAW").unwrap();
            let mut doc_info = DOC_INFO_1A {
                pDocName: doc.as_ptr() as *mut _,
                pOutputFile: std::ptr::null_mut(),
                pDatatype: raw.as_ptr() as *mut _,
            };
            if StartDocPrinterA(handle, 1, &mut doc_info as *mut _ as *mut u8) == 0 {
                ClosePrinter(handle);
                return Err("StartDocPrinter(RAW) failed — the driver may not accept raw jobs.".into());
            }

            let mut replies = Vec::<Vec<u8>>::with_capacity(steps.len());
            let mut failure = String::new();

            'steps: for (out, read_ms) in steps {
                let mut result = Vec::<u8>::new();
                let mut written: u32 = 0;
                if WritePrinter(handle, out.as_ptr() as *mut _, out.len() as u32, &mut written) == 0 {
                    failure = "WritePrinter failed.".into();
                    break 'steps;
                }
                let deadline = Instant::now() + Duration::from_millis((*read_ms).max(50) as u64);
                let mut chunk = [0u8; 512];
                let mut read: u32 = 0;
                loop {
                    let ok = ReadPrinter(handle, chunk.as_mut_ptr() as *mut _, chunk.len() as u32, &mut read);
                    if ok != 0 && read > 0 {
                        result.extend_from_slice(&chunk[..read as usize]);
                        if result.len() >= max_read {
                            break;
                        }
                        continue;
                    }
                    if Instant::now() >= deadline {
                        break;
                    }
                    sleep(Duration::from_millis(25));
                }
                replies.push(result);
            }

            EndDocPrinter(handle);
            ClosePrinter(handle);
            if !failure.is_empty() {
                return Err(failure);
            }
            Ok(replies)
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::PrinterDescriptor;
    pub fn list_printers() -> Result<Vec<PrinterDescriptor>, String> {
        Err("Epson maintenance needs the Windows desktop build (WinSpool RAW jobs).".into())
    }
    pub fn transact(_printer: &str, _out: &[u8], _read_ms: u32, _max_read: usize) -> Result<Vec<u8>, String> {
        Err("Epson maintenance needs the Windows desktop build (WinSpool RAW jobs).".into())
    }
    pub fn script(_printer: &str, _steps: &[(Vec<u8>, u32)], _max_read: usize) -> Result<Vec<Vec<u8>>, String> {
        Err("Epson maintenance needs the Windows desktop build (WinSpool RAW jobs).".into())
    }
}

/// List installed printers (all vendors — the UI filters and flags Epson).
#[tauri::command]
pub fn epson_list_printers() -> Result<Vec<PrinterDescriptor>, String> {
    imp::list_printers()
}

/// Send a hex-encoded payload as a RAW job and return the reply bytes
/// hex-encoded (same JSON-bridge convention as serial_write).
#[tauri::command]
pub async fn epson_raw_transact(
    printer: String,
    hex: String,
    read_ms: Option<u64>,
    max_read: Option<usize>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = from_hex(&hex)?;
        let reply = imp::transact(&printer, &bytes, read_ms.unwrap_or(600) as u32, max_read.unwrap_or(4096))?;
        Ok(reply.iter().map(|b| format!("{:02x}", b)).collect::<String>())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// One scripted step of an interleaved exchange.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptStep {
    pub hex: String,
    pub read_ms: u64,
}

/// Run write→read steps inside ONE RAW spooler job and return each step's
/// reply hex-encoded. Needed for stateful protocols (IEEE 1284.4 handshake).
#[tauri::command]
pub async fn epson_raw_script(
    printer: String,
    steps: Vec<ScriptStep>,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let parsed = steps
            .iter()
            .map(|s| from_hex(&s.hex).map(|b| (b, s.read_ms.max(50) as u32)))
            .collect::<Result<Vec<_>, String>>()?;
        let replies = imp::script(&printer, &parsed, 4096)?;
        Ok(replies
            .iter()
            .map(|r| r.iter().map(|b| format!("{:02x}", b)).collect::<String>())
            .collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

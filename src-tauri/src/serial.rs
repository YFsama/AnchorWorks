// Persistent serial-port link for the Plotter console.
//
// The original `serial_send` opened the port, dumped the whole job and
// closed it again — fine for a "save file then spool" workflow, but it
// made live debugging impossible: no read-back, no baud choice, no way
// to jog the carriage between jobs, and every send re-opened the port.
//
// This module keeps OS handles alive in a process-wide registry keyed by
// a small integer id. The JS side (`src/lib/plotterLink.ts`) opens once,
// then interleaves paced writes (`serial_write`, hex payload so binary
// jobs survive the IPC bridge) with read polls (`serial_read`). Handles
// are closed via `serial_close`; dropping the registry entry also drops
// (and therefore flushes/closes) the OS handle.
//
// All commands run through `spawn_blocking` so a slow serial transfer
// never stalls the webview's main thread — the legacy `serial_send` was
// a sync command, which Tauri executes on the main thread.

use std::collections::HashMap;
use std::io::{ErrorKind, Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;

/// One serial port descriptor — matches the shape the Plotter dialog expects
/// to render the picker dropdown. `usb_info` fields are `None` for built-in
/// UARTs and Bluetooth virtual ports.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialPortDescriptor {
    /// OS-level path — `/dev/ttyUSB0` on Linux, `COM3` on Windows,
    /// `/dev/cu.usbmodem*` on macOS. This is what the frontend hands back
    /// to `serial_open` when the user picks a port.
    pub path: String,
    /// Human-readable port kind — `usb` / `bluetooth` / `pci` / `unknown`.
    pub kind: &'static str,
    /// USB vendor name, when the port is a USB serial adapter and the
    /// platform driver populates the field. `None` for built-in UARTs.
    pub manufacturer: Option<String>,
    /// USB vendor id (e.g. `0x0403` for FTDI). `None` for non-USB ports.
    pub vid: Option<u16>,
    /// USB product id. `None` for non-USB ports.
    pub pid: Option<u16>,
    /// Free-form product string, when available. `None` for built-in UARTs.
    pub product: Option<String>,
}

/// Enumerate serial ports the OS knows about. Replaces the Web Serial
/// `navigator.serial.requestPort()` chooser when running under Tauri —
/// the desktop shell can show the full list without requiring user gesture
/// + permission grant per port (which the web API mandates).
#[tauri::command]
pub fn serial_list_ports() -> Result<Vec<SerialPortDescriptor>, String> {
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    Ok(ports
        .into_iter()
        .map(|p| {
            use serialport::SerialPortType;
            match p.port_type {
                SerialPortType::UsbPort(info) => SerialPortDescriptor {
                    path: p.port_name,
                    kind: "usb",
                    manufacturer: info.manufacturer,
                    vid: Some(info.vid),
                    pid: Some(info.pid),
                    product: info.product,
                },
                SerialPortType::BluetoothPort => SerialPortDescriptor {
                    path: p.port_name,
                    kind: "bluetooth",
                    manufacturer: None,
                    vid: None,
                    pid: None,
                    product: None,
                },
                SerialPortType::PciPort => SerialPortDescriptor {
                    path: p.port_name,
                    kind: "pci",
                    manufacturer: None,
                    vid: None,
                    pid: None,
                    product: None,
                },
                SerialPortType::Unknown => SerialPortDescriptor {
                    path: p.port_name,
                    kind: "unknown",
                    manufacturer: None,
                    vid: None,
                    pid: None,
                    product: None,
                },
            }
        })
        .collect())
}

type PortMap = HashMap<u32, Box<dyn serialport::SerialPort>>;

fn registry() -> &'static Mutex<PortMap> {
    static REGISTRY: OnceLock<Mutex<PortMap>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn next_id() -> u32 {
    static NEXT: AtomicU32 = AtomicU32::new(1);
    NEXT.fetch_add(1, Ordering::Relaxed)
}

/// Timeout configured on the port itself. Kept SHORT on purpose: the
/// registry mutex is held for the duration of each `read` syscall, so a
/// lazy 60 ms port timeout would stall concurrent `serial_write` calls
/// behind an in-flight read and throttle paced transfers. `serial_read`
/// loops on its OWN deadline (see `timeout_ms`), so a short port timeout
/// loses no data — the loop just retries until the caller's deadline.
const PORT_READ_TIMEOUT_MS: u64 = 10;

/// Open a port and keep it in the registry. `flow` accepts `"none"`
/// (default), `"hardware"` (RTS/CTS) and `"software"` (XON/XOFF). Returns
/// the registry id the JS link uses for subsequent write/read/close calls.
#[tauri::command]
pub async fn serial_open(path: String, baud: u32, flow: Option<String>) -> Result<u32, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut builder = serialport::new(&path, baud)
            .timeout(Duration::from_millis(PORT_READ_TIMEOUT_MS))
            .data_bits(serialport::DataBits::Eight)
            .stop_bits(serialport::StopBits::One)
            .parity(serialport::Parity::None);
        builder = match flow.as_deref() {
            Some("hardware") => builder.flow_control(serialport::FlowControl::Hardware),
            Some("software") => builder.flow_control(serialport::FlowControl::Software),
            _ => builder.flow_control(serialport::FlowControl::None),
        };
        let port = builder.open().map_err(|e| e.to_string())?;
        let id = next_id();
        registry().lock().map_err(|e| e.to_string())?.insert(id, port);
        Ok(id)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Decode a hex string (2 chars per byte, from `plotterLink.writeChunk`).
/// Hex keeps binary-safe payloads intact across the JSON IPC bridge.
fn from_hex(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 {
        return Err("hex payload must have an even length".into());
    }
    (0..s.len() / 2)
        .map(|i| u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).map_err(|e| e.to_string()))
        .collect()
}

/// Write a hex-encoded payload to an open port and flush. Returns the
/// number of bytes written.
#[tauri::command]
pub async fn serial_write(id: u32, hex: String) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = from_hex(&hex)?;
        let mut map = registry().lock().map_err(|e| e.to_string())?;
        let port = map.get_mut(&id).ok_or("serial port is not open")?;
        port.write_all(&bytes).map_err(|e| e.to_string())?;
        port.flush().map_err(|e| e.to_string())?;
        Ok(bytes.len())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Read whatever the device sent. Waits up to `timeout_ms` for the FIRST
/// byte, then drains buffered bytes until `max_bytes` or the deadline.
/// Returns an empty vec on silence — the JS poll loop treats that as a
/// no-op, not an error.
#[tauri::command]
pub async fn serial_read(id: u32, timeout_ms: u64, max_bytes: usize) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let deadline = Instant::now() + Duration::from_millis(timeout_ms.max(1));
        let mut out: Vec<u8> = Vec::with_capacity(256);
        let mut buf = [0u8; 512];
        loop {
            if out.len() >= max_bytes || Instant::now() >= deadline {
                break;
            }
            let n = {
                let mut map = registry().lock().map_err(|e| e.to_string())?;
                let port = map.get_mut(&id).ok_or("serial port is not open")?;
                match port.read(&mut buf) {
                    Ok(n) => n,
                    Err(e) if e.kind() == ErrorKind::TimedOut || e.kind() == ErrorKind::WouldBlock => 0,
                    Err(e) => return Err(e.to_string()),
                }
            };
            if n == 0 {
                // Nothing this poll — if we already have data, drain it now;
                // otherwise wait a tick so we don't spin the CPU.
                if !out.is_empty() {
                    break;
                }
                std::thread::sleep(Duration::from_millis(10));
                continue;
            }
            out.extend_from_slice(&buf[..n.min(buf.len())]);
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Toggle the DTR / RTS control lines on an open port. Classic debugging
/// lever for "the cutter powers up but never replies": many plotters and
/// USB-serial adapters gate their RS-232 driver on DTR, and a stuck line
/// wedges the device until it is toggled. Either line may be omitted to
/// leave it unchanged.
#[tauri::command]
pub async fn serial_set_control(
    id: u32,
    dtr: Option<bool>,
    rts: Option<bool>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut map = registry().lock().map_err(|e| e.to_string())?;
        let port = map.get_mut(&id).ok_or("serial port is not open")?;
        if let Some(dtr) = dtr {
            port.write_data_terminal_ready(dtr).map_err(|e| e.to_string())?;
        }
        if let Some(rts) = rts {
            port.write_request_to_send(rts).map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Close a registry port (drop = flush + close). Returns true when an
/// open handle existed. Never errors for unknown ids — close is idempotent
/// from the caller's perspective.
#[tauri::command]
pub async fn serial_close(id: u32) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let removed = registry().lock().map_err(|e| e.to_string())?.remove(&id);
        Ok(removed.is_some())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Legacy one-shot: open `path`, dump `payload`, close. Kept for the
/// "send without connecting" path and any external callers.
#[tauri::command]
pub fn serial_send(path: String, baud: u32, payload: String) -> Result<(), String> {
    let mut port = serialport::new(path, baud)
        .timeout(std::time::Duration::from_millis(5000))
        .open()
        .map_err(|e| e.to_string())?;
    for chunk in payload.as_bytes().chunks(256) {
        port.write_all(chunk).map_err(|e| e.to_string())?;
    }
    port.flush().map_err(|e| e.to_string())?;
    Ok(())
}

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

/* --------------------------------------------------------------------- *
 * SNMP transport (all platforms) — how epson_print_conf talks to
 * network-attached Epsons. The EPSON-CTRL frame bytes are appended to
 * the enterprise OID 1.3.6.1.4.1.1248.1.2.2.44.1.1.2.1 as extra arcs of
 * a plain SNMP v1 GET (community "public"); the reply's OCTET STRING is
 * the @BDC/EE: answer. BER is hand-rolled — the message is tiny and
 * fixed-shape, no MIB machinery needed.
 */

mod snmp {
    fn ber_len(len: usize) -> Vec<u8> {
        if len < 0x80 {
            vec![len as u8]
        } else if len <= 0xff {
            vec![0x81, len as u8]
        } else {
            vec![0x82, (len >> 8) as u8, len as u8]
        }
    }

    pub(super) fn tlv(tag: u8, content: &[u8]) -> Vec<u8> {
        let mut out = vec![tag];
        out.extend(ber_len(content.len()));
        out.extend_from_slice(content);
        out
    }

    /// Shortest two's-complement INTEGER (version/id/error fields are tiny).
    pub(super) fn int(v: u32) -> Vec<u8> {
        let bytes = v.to_be_bytes();
        let first = bytes.iter().position(|b| *b != 0).unwrap_or(3);
        let significant = &bytes[first..];
        if significant[0] & 0x80 != 0 {
            tlv(0x02, &[&[0x00][..], significant].concat())
        } else {
            tlv(0x02, significant)
        }
    }

    /// OID arcs (first must be 1, second < 40 for this tree).
    pub(super) fn oid(arcs: &[u32]) -> Vec<u8> {
        let mut content = vec![(40 * arcs[0] + arcs[1]) as u8];
        for &a in &arcs[2..] {
            if a < 0x80 {
                content.push(a as u8);
            } else {
                // base-128, most significant first; every byte except the
                // LAST keeps the 0x80 continuation bit (1248 → 89 60)
                let mut stack = Vec::new();
                let mut v = a;
                loop {
                    stack.push((v & 0x7f) as u8);
                    v >>= 7;
                    if v == 0 {
                        break;
                    }
                }
                stack.reverse();
                let last = stack.len() - 1;
                for (i, b) in stack.iter().enumerate() {
                    content.push(if i == last { *b } else { b | 0x80 });
                }
            }
        }
        tlv(0x06, &content)
    }

    /// One PDU-worth of TLV walk: (tag, content_range, rest). Returns None
    /// on a truncated stream.
    fn next_tlv(buf: &[u8]) -> Option<(u8, std::ops::Range<usize>, &[u8])> {
        if buf.len() < 2 {
            return None;
        }
        let tag = buf[0];
        let (len, header): (usize, usize) = match buf[1] {
            l if l < 0x80 => (l as usize, 2),
            0x81 if buf.len() >= 3 => (buf[2] as usize, 3),
            0x82 if buf.len() >= 4 => (((buf[2] as usize) << 8) | buf[3] as usize, 4),
            _ => return None,
        };
        let start = header;
        let end = start.checked_add(len)?;
        if end > buf.len() {
            return None;
        }
        Some((tag, start..end, &buf[end..]))
    }

    const EPSON_CTRL_PREFIX: &[u32] = &[1, 3, 6, 1, 4, 1, 1248, 1, 2, 2, 44, 1, 1, 2, 1];

    /// Encode the full SNMP v1 GET message for the EPSON-CTRL OID.
    pub(super) fn build_get_request(frame: &[u8]) -> Vec<u8> {
        let mut arcs = EPSON_CTRL_PREFIX.to_vec();
        arcs.extend(frame.iter().map(|b| *b as u32));
        // varbind = SEQUENCE{ OID, NULL }, then list, PDU, message
        let varbind_seq = tlv(0x30, &[oid(&arcs), tlv(0x05, &[])].concat());
        let varbind_list = tlv(0x30, &varbind_seq);
        let pdu = tlv(0xa0, &[int(1), int(0), int(0), varbind_list].concat());
        let community = tlv(0x04, b"public");
        tlv(0x30, &[int(0), community, pdu].concat())
    }

    /// BER child at the start of `buf`: require `tag`, hand back
    /// (content, siblings-after). The returned range is only ever applied
    /// to the same slice it was parsed from, so indexing stays in bounds.
    fn expect<'a>(buf: &'a [u8], tag: u8, what: &str) -> Result<(&'a [u8], &'a [u8]), String> {
        let (found, range, rest) =
            next_tlv(buf).ok_or_else(|| format!("malformed SNMP reply: truncated at {what}"))?;
        if found != tag {
            return Err(format!(
                "malformed SNMP reply: expected {what} (tag {tag:#04x}), found {found:#04x}"
            ));
        }
        Ok((&buf[range], rest))
    }

    /// Big-endian two's-complement INTEGER content (error-status is all we
    /// read; an empty body counts as 0 rather than failing the parse).
    fn decode_int(content: &[u8]) -> i64 {
        let mut v: i64 = if content.first().map_or(false, |b| b & 0x80 != 0) { -1 } else { 0 };
        for &b in content {
            v = (v << 8) | b as i64;
        }
        v
    }

    /// Pull the printer's answer out of an SNMP v1 GetResponse:
    /// SEQUENCE{ INTEGER version, OCTET STRING community, [0xA2] PDU{
    /// INTEGER request-id, INTEGER error-status, INTEGER error-index,
    /// SEQUENCE{ SEQUENCE{ OID, value } } } }. The value is the OID's
    /// *sibling* inside the varbind — descending into the OID's own
    /// content bytes would yield arc fragments, never the OCTET STRING.
    /// Malformed input is always an Err, never a panic.
    pub(super) fn parse_reply(buf: &[u8]) -> Result<Vec<u8>, String> {
        let (message, _) = expect(buf, 0x30, "message SEQUENCE")?;
        let (_, message) = expect(message, 0x02, "version INTEGER")?;
        let (_, message) = expect(message, 0x04, "community OCTET STRING")?;
        let (pdu, _) = expect(message, 0xa2, "GetResponse PDU")?;

        let (_, pdu) = expect(pdu, 0x02, "request-id INTEGER")?;
        let (error_status_raw, pdu) = expect(pdu, 0x02, "error-status INTEGER")?;
        let error_status = decode_int(error_status_raw);
        if error_status != 0 {
            return Err(format!(
                "SNMP error-status {error_status} — the printer rejected the OID (wrong command bytes?)"
            ));
        }
        let (_, pdu) = expect(pdu, 0x02, "error-index INTEGER")?;
        let (varbind_list, _) = expect(pdu, 0x30, "varbind list SEQUENCE")?;

        // first varbind: skip the OID, take the value TLV that follows it
        let (varbind, _) = expect(varbind_list, 0x30, "varbind SEQUENCE")?;
        let (_, after_oid) = expect(varbind, 0x06, "varbind OID")?;
        let (_, value, _) = next_tlv(after_oid)
            .ok_or_else(|| "malformed SNMP reply: varbind carries no value".to_string())?;
        Ok(after_oid[value].to_vec())
    }

    /// Receive buffer: sized to swallow any sane SNMP reply with headroom.
    const RECV_BUF: usize = 16 * 1024;

    /// Join host and port for UdpSocket's string address form. IPv6
    /// literals ("::1", "fe80::1") contain ':' and must be bracketed or
    /// "host:port" parses as garbage; IPv4, names and already-bracketed
    /// hosts pass through untouched.
    pub(super) fn join_host_port(host: &str, port: u16) -> String {
        if host.contains(':') && !host.starts_with('[') {
            format!("[{host}]:{port}")
        } else {
            format!("{host}:{port}")
        }
    }

    /// True when a recv failure means "the datagram did not fit the
    /// buffer" (WSAEMSGSIZE on Windows, EMSGSIZE elsewhere). Matched on
    /// the OS message text so no platform-specific code is needed —
    /// winsock's FormatMessage text and POSIX strerror both render it as
    /// some flavor of "too long / larger than".
    pub(super) fn is_too_large(e: &std::io::Error) -> bool {
        let text = e.to_string().to_ascii_lowercase();
        text.contains("too long") || text.contains("too large") || text.contains("larger than")
    }

    /// Send one EPSON-CTRL frame over SNMP and return the raw reply octets.
    pub fn ctrl(host: &str, port: u16, frame: &[u8], timeout_ms: u64) -> Result<Vec<u8>, String> {
        use std::net::UdpSocket;
        use std::time::Duration;

        let message = build_get_request(frame);

        let addr = join_host_port(host, port);
        let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| format!("UDP bind failed: {e}"))?;
        socket
            .set_read_timeout(Some(Duration::from_millis(timeout_ms.max(100))))
            .map_err(|e| format!("UDP timeout setup failed: {e}"))?;
        socket
            .send_to(&message, &addr)
            .map_err(|e| format!("send to {addr} failed: {e} — is the host an IP address?"))?;

        // A datagram beyond the buffer does not truncate on Windows —
        // recv_from fails outright — so report it as oversized rather
        // than letting it masquerade as "no SNMP answer".
        let mut buf = vec![0u8; RECV_BUF];
        let (n, _) = socket.recv_from(&mut buf).map_err(|e| {
            if is_too_large(&e) {
                format!("SNMP reply from {addr} exceeded the {RECV_BUF}-byte receive buffer")
            } else {
                format!("no SNMP answer from {addr} ({e}) — check the IP and that SNMP (UDP 161) is enabled")
            }
        })?;
        parse_reply(&buf[..n])
    }
}

#[cfg(test)]
mod snmp_tests {
    use super::snmp;

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect::<Vec<_>>().join("")
    }

    /// Golden bytes for the SNMP v1 GET carrying the "st\1\0\1" EPSON-CTRL
    /// frame. Length bytes verified against the BER re-encode of the same
    /// message (OID content is 20 bytes; 1248 encodes as 89 60).
    #[test]
    fn get_request_golden_bytes() {
        let msg = snmp::build_get_request(&[0x73, 0x74, 0x01, 0x00, 0x01]);
        assert_eq!(
            hex(&msg),
            concat!(
                "303202010004067075626c6963",           // SEQUENCE{ version 0, "public"
                "a025020101020100020100",               //  GET{ id 1, err 0, idx 0
                "301a301806142b0601040189600102022c0101020173740100010500", // varbind{OID,NULL} }
            )
        );
    }

    /// Arcs >= 0x80 must split into continuation bytes with the 0x80 bit on
    /// all but the final byte (255 → 81 7f), per X.690 clause 8.19.
    #[test]
    fn oid_arc_splitting() {
        let encoded = snmp::oid(&[1, 3, 255]);
        assert!(encoded.ends_with(&[0x81, 0x7f]), "got {encoded:?}");
    }

    /// Assemble a well-shaped SNMP v1 GetResponse for the EPSON-CTRL OID —
    /// the same structure a real agent answers with.
    fn get_response(error_status: u32, value: &[u8]) -> Vec<u8> {
        let oid = snmp::oid(&[
            1, 3, 6, 1, 4, 1, 1248, 1, 2, 2, 44, 1, 1, 2, 1, 0x73, 0x74, 1, 0, 1,
        ]);
        let varbind = snmp::tlv(0x30, &[oid, snmp::tlv(0x04, value)].concat());
        let varbind_list = snmp::tlv(0x30, &varbind);
        let pdu = snmp::tlv(
            0xa2,
            &[snmp::int(1), snmp::int(error_status), snmp::int(0), varbind_list].concat(),
        );
        snmp::tlv(0x30, &[snmp::int(0), snmp::tlv(0x04, b"public"), pdu].concat())
    }

    /// The parser must return exactly the varbind value's content bytes —
    /// the @BDC/EE: answer — walking message → PDU → varbind-list →
    /// varbind → value as siblings, never descending into the OID's arcs.
    #[test]
    fn parse_reply_returns_varbind_payload() {
        let short = b"@BDC PS\r\nEE:0030AC;";
        assert_eq!(snmp::parse_reply(&get_response(0, short)).unwrap(), short.to_vec());

        // >255 bytes of payload forces the 0x81/0x82 long-length forms
        // through every wrapper on the way down.
        let long: Vec<u8> = (0..300u16).map(|i| (i % 251) as u8).collect();
        assert_eq!(snmp::parse_reply(&get_response(0, &long)).unwrap(), long);
    }

    /// A non-zero error-status must surface as an Err that names it.
    #[test]
    fn parse_reply_reports_error_status() {
        let err = snmp::parse_reply(&get_response(2, &[])).unwrap_err();
        assert!(err.contains("error-status"), "message was: {err}");
        assert!(err.contains('2'), "message was: {err}");
    }

    /// Truncated, mangled and adversarial inputs must fail cleanly — Err,
    /// never a panic.
    #[test]
    fn parse_reply_rejects_malformed_input() {
        // every strict prefix of a valid reply is a truncated reply
        let good = get_response(0, b"ok");
        for cut in 0..good.len() {
            assert!(snmp::parse_reply(&good[..cut]).is_err(), "prefix {cut} parsed");
        }
        let bad: [&[u8]; 7] = [
            &[],
            &[0x30],
            &[0x30, 0x80, 0x02, 0x01, 0x00], // indefinite length
            &[0x30, 0x82, 0xff, 0xff, 0x02, 0x01, 0x00], // length past the buffer
            &[0x31, 0x03, 0x02, 0x01, 0x00], // wrong outer tag
            &[0x30, 0x00],                   // empty message
            b"public",
        ];
        for buf in bad {
            assert!(snmp::parse_reply(buf).is_err(), "{buf:?} parsed");
        }
        // a well-formed request (0xA0 PDU, NULL value) is not a reply
        assert!(snmp::parse_reply(&snmp::build_get_request(b"st")).is_err());
        // empty varbind list → no binding to take a value from
        let pdu = snmp::tlv(
            0xa2,
            &[snmp::int(1), snmp::int(0), snmp::int(0), snmp::tlv(0x30, &[])].concat(),
        );
        let empty_list = snmp::tlv(0x30, &[snmp::int(0), snmp::tlv(0x04, b"public"), pdu].concat());
        assert!(snmp::parse_reply(&empty_list).is_err());
    }

    /// End-to-end over loopback UDP: a one-shot responder receives the GET,
    /// answers with a canned GetResponse, and `ctrl` must surface the
    /// varbind payload — covering the send, recv and parse paths together.
    #[test]
    fn ctrl_loopback_round_trip() {
        use std::net::UdpSocket;
        use std::sync::mpsc;
        use std::thread;
        use std::time::Duration;

        let frame: &[u8] = &[0x73, 0x74, 0x01, 0x00, 0x01];
        let payload = b"@BDC PS\r\nEE:0030AC;".to_vec();

        let responder = UdpSocket::bind("127.0.0.1:0").expect("loopback bind");
        let port = responder.local_addr().expect("local addr").port();
        let reply = get_response(0, &payload);

        let (tx, rx) = mpsc::channel();
        let worker = thread::spawn(move || {
            let mut buf = vec![0u8; 2048];
            let (n, peer) = responder.recv_from(&mut buf).expect("responder recv");
            tx.send(buf[..n].to_vec()).expect("channel alive");
            responder.send_to(&reply, peer).expect("responder send");
        });

        let got = snmp::ctrl("127.0.0.1", port, frame, 2000).expect("ctrl round trip");
        let seen = rx.recv_timeout(Duration::from_secs(2)).expect("responder saw a request");
        assert_eq!(seen, snmp::build_get_request(frame), "wire bytes of the GET changed");
        assert_eq!(got, payload);
        worker.join().expect("responder thread");
    }

    /// IPv6 literals must be bracketed before ":port" is appended or the
    /// address parses as garbage ("::1" → host "::" port "1"); IPv4, plain
    /// names and already-bracketed hosts pass through untouched.
    #[test]
    fn join_host_port_brackets_ipv6_literals() {
        assert_eq!(snmp::join_host_port("192.168.1.5", 161), "192.168.1.5:161");
        assert_eq!(snmp::join_host_port("printer.lan", 161), "printer.lan:161");
        assert_eq!(snmp::join_host_port("::1", 161), "[::1]:161");
        assert_eq!(snmp::join_host_port("fe80::1", 161), "[fe80::1]:161");
        assert_eq!(snmp::join_host_port("[::1]", 161), "[::1]:161");
    }

    /// "Datagram larger than the buffer" recv failures are recognized from
    /// their OS message text (WSAEMSGSIZE / EMSGSIZE) so they surface as an
    /// oversized reply instead of a misleading "no SNMP answer".
    #[test]
    fn oversized_reply_errors_are_recognized() {
        use std::io::{Error, ErrorKind};
        // POSIX strerror for EMSGSIZE
        assert!(snmp::is_too_large(&Error::new(ErrorKind::Other, "Message too long")));
        // winsock FormatMessage text for WSAEMSGSIZE (10040)
        assert!(snmp::is_too_large(&Error::new(
            ErrorKind::Other,
            "A message sent on a datagram socket was larger than the internal message buffer"
        )));
        // ordinary recv failures must not match
        assert!(!snmp::is_too_large(&Error::new(ErrorKind::Other, "Connection timed out")));
        assert!(!snmp::is_too_large(&Error::new(ErrorKind::Other, "network is unreachable")));
    }
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

/// One EPSON-CTRL frame over SNMP (network printers, all platforms).
#[tauri::command]
pub async fn epson_snmp_ctrl(
    host: String,
    frame_hex: String,
    port: Option<u16>,
    timeout_ms: Option<u64>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let frame = from_hex(&frame_hex)?;
        let reply = snmp::ctrl(&host, port.unwrap_or(161), &frame, timeout_ms.unwrap_or(1500))?;
        Ok(reply.iter().map(|b| format!("{:02x}", b)).collect::<String>())
    })
    .await
    .map_err(|e| e.to_string())?
}

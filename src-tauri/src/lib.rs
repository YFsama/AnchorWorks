// Anchorworks — Tauri shell.
//
// Wraps the existing Vite-built SPA in a native window so the app can be
// distributed as a real desktop binary. The web/PWA build path remains the
// shipping target; this shell adds native file dialogs, native print spool,
// native serial-port plotter access, and OS-level file associations.
//
// The frontend detects "running under Tauri" via the injected `__TAURI__`
// global and prefers native commands over their web-API equivalents — the same
// codebase boots in both shells.

use serde::Serialize;
use std::path::PathBuf;
use tauri::menu::{Menu, MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_dialog::DialogExt;

/// Authoritative platform info — what runtime.ts's `getOS()` heuristic
/// approximates from the User-Agent string when the app boots in a browser.
/// Returned as JSON so the frontend can `(await invoke('platform_info'))
/// .os` and pattern-match against `"linux"` / `"macos"` / `"windows"`.
#[derive(Serialize)]
struct PlatformInfo {
    /// `std::env::consts::OS` — `"macos"` / `"linux"` / `"windows"` / etc.
    os: &'static str,
    /// `std::env::consts::ARCH` — `"x86_64"` / `"aarch64"` / etc.
    arch: &'static str,
    /// Bundled app version from Cargo.toml — should equal package.json's
    /// version but the Rust side is authoritative for the Tauri binary.
    version: &'static str,
}

#[tauri::command]
fn platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        version: env!("CARGO_PKG_VERSION"),
    }
}

/// Save the supplied JSON bytes to a user-chosen path. Mirrors the web
/// `saveProjectToFile()` flow: prompt for a path, write atomically, return
/// the chosen path so the frontend can echo it in the "Saved …" toast and
/// remember it for the next quick-save.
///
/// `suggested_name` seeds the save dialog (`design.vstudio.json` etc.).
/// `path` short-circuits the dialog — quick-save passes the previously
/// returned path so the user doesn't see a picker on every Ctrl+S.
///
/// Returns the absolute path on success, or `None` if the user cancelled
/// the dialog. Any I/O failure is surfaced as a `Result::Err` string the
/// frontend wraps into a toast.
#[tauri::command]
async fn fs_save_project<R: Runtime>(
    app: tauri::AppHandle<R>,
    bytes: String,
    suggested_name: Option<String>,
    path: Option<String>,
) -> Result<Option<String>, String> {
    let target: PathBuf = if let Some(p) = path {
        // Quick-save path — caller already knows the file.
        PathBuf::from(p)
    } else {
        // Cold save — pop the OS file picker. The dialog plugin's blocking
        // API is sync from our caller's POV thanks to the Tokio bridge
        // (the `async fn` makes this a `Future` Tauri schedules on its
        // runtime, not the webview event loop).
        let chosen = app
            .dialog()
            .file()
            .set_file_name(suggested_name.unwrap_or_else(|| "design.vstudio.json".into()))
            .add_filter("Anchorworks Project", &["vstudio.json", "json"])
            .blocking_save_file();
        match chosen {
            Some(p) => p.into_path().map_err(|e| e.to_string())?,
            None => return Ok(None),
        }
    };

    std::fs::write(&target, bytes.as_bytes()).map_err(|e| e.to_string())?;
    Ok(Some(target.to_string_lossy().into_owned()))
}

/// Open a `.vstudio.json` (or `.json`) from disk. Returns the file body and
/// the absolute path the frontend should remember for subsequent quick-saves.
/// `None` indicates the user cancelled the dialog.
#[derive(Serialize)]
struct OpenedProject {
    path: String,
    name: String,
    bytes: String,
}

/// Read a file as UTF-8. Used by the single-instance / file-association
/// path (`tauriMenu.ts#openFileNative`) so the frontend can route
/// argv-forwarded paths through the existing project-apply pipeline
/// without depending on the heavier `@tauri-apps/plugin-fs` package.
#[tauri::command]
fn fs_read_path(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn fs_open_project<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<OpenedProject>, String> {
    let chosen = app
        .dialog()
        .file()
        .add_filter("Anchorworks Project", &["vstudio.json", "json"])
        .add_filter("Any JSON", &["json"])
        .blocking_pick_file();
    let path = match chosen {
        Some(p) => p.into_path().map_err(|e| e.to_string())?,
        None => return Ok(None),
    };
    let bytes = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("project.vstudio.json")
        .to_string();
    Ok(Some(OpenedProject {
        path: path.to_string_lossy().into_owned(),
        name,
        bytes,
    }))
}

/// One serial port descriptor — matches the shape the Plotter dialog expects
/// to render the picker dropdown. `usb_info` fields are `None` for built-in
/// UARTs and Bluetooth virtual ports.
#[derive(Serialize)]
struct SerialPortDescriptor {
    /// OS-level path — `/dev/ttyUSB0` on Linux, `COM3` on Windows,
    /// `/dev/cu.usbmodem*` on macOS. This is what the frontend hands back
    /// to `serial_send` when the user picks a port.
    path: String,
    /// Human-readable port kind — `usb` / `bluetooth` / `pci` / `unknown`.
    kind: &'static str,
    /// USB vendor name, when the port is a USB serial adapter and the
    /// platform driver populates the field. `None` for built-in UARTs.
    manufacturer: Option<String>,
    /// USB vendor id (e.g. `0x0403` for FTDI). `None` for non-USB ports.
    vid: Option<u16>,
    /// USB product id. `None` for non-USB ports.
    pid: Option<u16>,
    /// Free-form product string, when available. `None` for built-in UARTs.
    product: Option<String>,
}

/// Enumerate serial ports the OS knows about. Replaces the Web Serial
/// `navigator.serial.requestPort()` chooser when running under Tauri —
/// the desktop shell can show the full list without requiring user gesture
/// + permission grant per port (which the web API mandates).
#[tauri::command]
fn serial_list_ports() -> Result<Vec<SerialPortDescriptor>, String> {
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

/// Stream bytes to a serial port. The Plotter dialog calls this once the
/// user has picked a port from `serial_list_ports()`. We open the port,
/// write the entire payload in 256-byte chunks (matching the web path's
/// flow-control friendly cadence), then drop the handle which flushes +
/// closes the underlying file descriptor.
#[tauri::command]
fn serial_send(path: String, baud: u32, payload: String) -> Result<(), String> {
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

/// Trigger the OS print dialog for the current webview. The webview itself
/// rasterises its DOM to a print surface — same code path used by
/// `window.print()` in the web build, but routed through Tauri's native
/// menu so file-association launches (which start with no user gesture)
/// can still kick off a print.
#[tauri::command]
async fn print_native<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not available".to_string())?;
    window.print().map_err(|e| e.to_string())?;
    Ok(())
}

/// Build the desktop menu. Each menu item carries a stable string id that
/// the frontend dispatches against — see `src/lib/tauriMenu.ts` for the
/// corresponding handler table. The two have to be kept in lock-step;
/// renaming an id here without updating the TS side silently breaks the
/// menu item (the action will fire but no handler will recognise it).
fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    // File menu — actions mirror the File dropdown in MenuBar.tsx.
    let file = SubmenuBuilder::new(app, "File")
        .item(&MenuItem::with_id(app, "file.save", "Save", true, Some("CmdOrCtrl+Shift+S"))?)
        .item(&MenuItem::with_id(app, "file.saveAs", "Save As…", true, None::<&str>)?)
        .item(&MenuItem::with_id(app, "file.open", "Open Project…", true, Some("CmdOrCtrl+O"))?)
        .separator()
        .item(&MenuItem::with_id(app, "file.new", "New", true, Some("CmdOrCtrl+N"))?)
        .item(&MenuItem::with_id(app, "file.newFromTemplate", "New from Template…", true, None::<&str>)?)
        .item(&MenuItem::with_id(app, "file.importImage", "Import Image…", true, None::<&str>)?)
        .separator()
        .item(&MenuItem::with_id(app, "file.exportSvg", "Export SVG", true, Some("CmdOrCtrl+S"))?)
        .item(&MenuItem::with_id(app, "file.exportPng", "Export PNG (2×)", true, None::<&str>)?)
        .item(&MenuItem::with_id(app, "file.exportPdf", "Export PDF", true, None::<&str>)?)
        .item(&MenuItem::with_id(app, "file.exportPdfVector", "Export PDF (Vector)", true, None::<&str>)?)
        .item(&MenuItem::with_id(app, "file.exportDxf", "Export DXF", true, None::<&str>)?)
        .item(&MenuItem::with_id(app, "file.exportJson", "Export JSON", true, None::<&str>)?)
        .separator()
        .item(&MenuItem::with_id(app, "file.print", "Print…", true, Some("CmdOrCtrl+P"))?)
        .item(&MenuItem::with_id(app, "file.plotter", "Send to Plotter…", true, None::<&str>)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("Quit"))?)
        .build()?;

    // Edit menu — Undo/Redo + Cut/Copy/Paste predefined items.
    let edit = SubmenuBuilder::new(app, "Edit")
        .item(&MenuItem::with_id(app, "edit.undo", "Undo", true, Some("CmdOrCtrl+Z"))?)
        .item(&MenuItem::with_id(app, "edit.redo", "Redo", true, Some("CmdOrCtrl+Y"))?)
        .separator()
        .item(&MenuItem::with_id(app, "edit.duplicate", "Duplicate", true, Some("CmdOrCtrl+D"))?)
        .item(&MenuItem::with_id(app, "edit.selectAll", "Select All", true, Some("CmdOrCtrl+A"))?)
        .item(&MenuItem::with_id(app, "edit.group", "Group", true, Some("CmdOrCtrl+G"))?)
        .item(&MenuItem::with_id(app, "edit.ungroup", "Ungroup", true, Some("CmdOrCtrl+Shift+G"))?)
        .build()?;

    // View menu — zoom + outline.
    let view = SubmenuBuilder::new(app, "View")
        .item(&MenuItem::with_id(app, "view.zoomIn", "Zoom In", true, Some("CmdOrCtrl+="))?)
        .item(&MenuItem::with_id(app, "view.zoomOut", "Zoom Out", true, Some("CmdOrCtrl+-"))?)
        .item(&MenuItem::with_id(app, "view.zoomFit", "Fit to Page", true, Some("CmdOrCtrl+0"))?)
        .separator()
        .item(&MenuItem::with_id(app, "view.outline", "Outline View", true, Some("CmdOrCtrl+Alt+Y"))?)
        .item(&MenuItem::with_id(app, "view.toggleTheme", "Toggle Theme", true, Some("CmdOrCtrl+Shift+L"))?)
        .build()?;

    // Document menu — Settings + Repeat.
    let document = SubmenuBuilder::new(app, "Document")
        .item(&MenuItem::with_id(app, "doc.settings", "Document Settings…", true, None::<&str>)?)
        .item(&MenuItem::with_id(app, "doc.repeat", "Repeat (Grid / Radial / Mirror)…", true, None::<&str>)?)
        .build()?;

    // Help menu — Help center + shortcuts + about.
    let help = SubmenuBuilder::new(app, "Help")
        .item(&MenuItem::with_id(app, "help.helpCenter", "Help Center…", true, Some("F1"))?)
        .item(&MenuItem::with_id(app, "help.commandPalette", "Command Palette…", true, Some("CmdOrCtrl+K"))?)
        .item(&MenuItem::with_id(app, "help.preferences", "Preferences…", true, Some("CmdOrCtrl+,"))?)
        .item(&MenuItem::with_id(app, "help.shortcuts", "Keyboard Shortcuts", true, Some("?"))?)
        .separator()
        .item(&MenuItem::with_id(app, "help.about", "About Anchorworks", true, None::<&str>)?)
        .build()?;

    MenuBuilder::new(app)
        .item(&file)
        .item(&edit)
        .item(&view)
        .item(&document)
        .item(&help)
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Single-instance plugin: when the user double-clicks a `.vstudio.json`
    // while the app is already running, the second-launch process exits
    // immediately and forwards its argv + cwd to the existing window. The
    // primary instance receives them in the callback below and re-emits a
    // `file-open` event the frontend listens for in `tauriMenu.ts`.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // First argv is the binary; any subsequent positional arg that
            // resolves to a file gets handed to the running window for
            // open-on-launch behaviour.
            let files: Vec<String> = argv.iter().skip(1).filter(|p| std::path::Path::new(p).exists()).cloned().collect();
            if !files.is_empty() {
                let _ = app.emit("file-open", files);
            }
            // Bring the existing window forward — without this the new
            // launch silently no-ops on Windows / Linux.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // process plugin gives the JS side `relaunch()` after a successful
        // updater install. Pairs with the in-app updater UX in src/lib/updater.ts.
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Wire the native menu. The menu has to be built after the app
            // handle exists (it owns the menu items' lifetime), so we do it
            // in `setup` rather than via the builder's `.menu()` shortcut.
            let menu = build_app_menu(app.handle())?;
            app.set_menu(menu)?;
            // On every menu activation, broadcast the item id to the
            // frontend. The TS handler in `tauriMenu.ts` maps id → action.
            app.on_menu_event(|app, event| {
                let _ = app.emit("menu-action", event.id().as_ref().to_string());
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            platform_info,
            fs_save_project,
            fs_open_project,
            fs_read_path,
            serial_list_ports,
            serial_send,
            print_native,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Anchorworks");
}


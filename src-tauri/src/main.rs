// Prevent the Windows command prompt from popping up alongside the app in
// release builds. Has no effect on non-Windows targets.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    anchorworks_lib::run();
}

/** 平台检测（v1 仅用于窗口 chrome 形态分支；UA 判定，不为此引入 tauri-plugin-os） */
export const IS_WINDOWS = navigator.userAgent.includes("Windows NT");

export const isMac = navigator.userAgent.includes('Mac');
// Windows- and Linux-specific UI branches (as opposed to not-macOS) should
// test `navigator.userAgent.includes('Win')` at the use site so knip's
// unused-export check stays green until such a branch exists.

/** Height of the window chrome drawn over the top of the page: the native
 *  traffic-light strip on macOS, the app's own title bar everywhere else. */
export const windowChromeTopInset = isMac ? 32 : 34;

/** Display name for the primary modifier key: "Cmd" on macOS, "Ctrl" elsewhere. */
export const mod = isMac ? 'Cmd' : 'Ctrl';

/** Display name for the Alt/Option key: "Opt" on macOS, "Alt" elsewhere. */
export const alt = isMac ? 'Opt' : 'Alt';

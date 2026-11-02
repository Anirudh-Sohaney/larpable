# Temporary split views

The shared router keeps only post details, profiles with an ID, profile editing and existing post/project editing in a temporary pane on wide screens. Feed, Yours, Saved, own-profile navigation, fresh creation, Feedback, login and other main destinations replace the whole page. Bottom navigation always switches the main page, even if its destination can otherwise be previewed. The same policy applies to links and programmatic Panels.navigate calls from either the main page or iframe. App.navigate and logout use main-page navigation.

Temporary views reuse one iframe; internal view replacements do not add iframe history entries. Tab returns strip the embed parameter and navigate the parent page without requiring a parent-window Panels global. Cancel and successful save retain explicit return semantics. Closing unloads iframe content, hides the pane, clears selection and returns focus to its opener. Escape works inside either document; resizing to narrow view closes the split. On narrow screens content opens as a normal full-page view.

Iframe content renders normally without an overlay or a full-load-event visibility gate, so delayed media or fonts cannot leave a usable view hidden. Modified/new-window links, downloads, media controls, form controls and external links preserve their normal behavior. No database or backend routes change.

Regression coverage: tests/panes.test.js covers temporary route classification, top-level tab changes from either document, card/control behavior, modified links, return/cancel behavior, narrow layouts, focus restoration and unloading. tests/nav-scroll.test.js covers navigation visibility from parent/iframe scroll surfaces.

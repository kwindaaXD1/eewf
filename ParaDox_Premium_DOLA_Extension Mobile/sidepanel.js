// Toolbar icon opens popup.html (mobile Kiwi) or the docked Side Panel (desktop).
try {
  if (chrome?.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
      console.warn('Side Panel unavailable, popup will be used:', error);
    });
  }
} catch (error) {
  console.warn('Side Panel API missing (mobile Kiwi?), popup will be used:', error);
}

// This script runs on YouTube video pages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Content script received message:", request);
    
    if (request.action === "getTranscript") {
      getYouTubeTranscript()
        .then(transcript => {
          sendResponse({ success: true, transcript: transcript });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      
      return true; // Keep message channel open for async response
    }
  });
  
  // Function to get YouTube transcript
  async function getYouTubeTranscript() {
    // Check if we're on a YouTube video page
    if (!window.location.href.includes("youtube.com/watch")) {
      throw new Error("Not a YouTube video page");
    }
    
    // Check if transcript is already open
    let transcriptContainer = document.querySelector('ytd-transcript-search-panel-renderer');
    
    if (!transcriptContainer) {
      // Transcript not open yet, let's try to open it
      
      // 1. Find the "..." menu button
      const moreActionsButton = document.querySelector(
        'button.ytp-button[aria-label="More actions"], ' +
        'button.ytp-settings-button'
      );
      
      if (!moreActionsButton) {
        throw new Error("Could not find the More Actions button");
      }
      
      // 2. Click the "..." button
      moreActionsButton.click();
      
      // 3. Wait for menu to appear
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 4. Find and click "Show transcript" option
      const menuItems = Array.from(document.querySelectorAll(
        '.ytp-panel-menu [role="menuitem"], ' +
        '.ytp-menuitem, ' +
        'tp-yt-paper-item'
      ));
      
      const transcriptOption = menuItems.find(item => 
        item.textContent.includes('transcript') || 
        item.textContent.includes('Transcript')
      );
      
      if (!transcriptOption) {
        throw new Error("Could not find transcript option in menu");
      }
      
      transcriptOption.click();
      
      // 5. Wait for transcript to load
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Now transcript should be visible, let's extract it
    const transcriptEntries = document.querySelectorAll(
      'ytd-transcript-segment-renderer, ' + 
      '.ytd-transcript-renderer'
    );
    
    if (!transcriptEntries || transcriptEntries.length === 0) {
      throw new Error("No transcript entries found");
    }
    
    // Extract text and timestamps
    let transcript = "";
    transcriptEntries.forEach(entry => {
      const textElement = entry.querySelector('#text, .segment-text');
      const timeElement = entry.querySelector('#timestamp, .segment-timestamp');
      
      if (textElement) {
        const text = textElement.textContent.trim();
        const time = timeElement ? timeElement.textContent.trim() : "";
        
        transcript += time ? `[${time}] ${text}\n` : `${text}\n`;
      }
    });
    
    return transcript || "Transcript panel found but no text could be extracted";
  }
  
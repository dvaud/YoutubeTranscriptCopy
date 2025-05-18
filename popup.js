document.getElementById("extractButton").addEventListener("click", async () => {
  const statusElement = document.getElementById("status");
  const transcriptElement = document.getElementById("transcript");
  
  statusElement.textContent = "Working...";
  transcriptElement.textContent = "";
  
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.id) {
      statusElement.textContent = "Cannot access current tab";
      return;
    }
    
    // Check if we're on a YouTube video page
    if (!tab.url || !tab.url.includes("youtube.com/watch")) {
      statusElement.textContent = "This is not a YouTube video page!";
      return;
    }
    
    // Execute our description-focused transcript extractor
    statusElement.textContent = "Extracting transcript...";
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: descriptionFocusedExtractor
    });
    
    if (results && results[0] && results[0].result) {
      const result = results[0].result;
      
      if (result.transcript) {
        statusElement.textContent = "Transcript extracted successfully!";
        transcriptElement.textContent = result.transcript;
        
        // Show the copy button once we have a transcript
        const copyButton = document.getElementById("copyButton");
        if (copyButton) {
          copyButton.style.display = "block";
        } else {
          // Create copy button if it doesn't exist
          createCopyButton();
        }
      } else {
        statusElement.textContent = "Error: " + (result.error || "Unknown error");
        
        if (result.manualInstructions) {
          transcriptElement.textContent = result.manualInstructions;
        }
      }
    } else {
      statusElement.textContent = "Failed to execute script";
    }
  } catch (error) {
    statusElement.textContent = "Error: " + error.message;
    console.error(error);
  }
});

// Function to create and add copy button
function createCopyButton() {
  const copyButton = document.createElement("button");
  copyButton.id = "copyButton";
  copyButton.textContent = "Copy to Clipboard";
  copyButton.style.display = "block";
  copyButton.style.marginTop = "10px";
  copyButton.style.padding = "5px 10px";
  copyButton.style.cursor = "pointer";
  
  // Add event listener for the copy button
  copyButton.addEventListener("click", () => {
    const transcriptElement = document.getElementById("transcript");
    const textToCopy = transcriptElement.textContent;
    
    // Copy to clipboard
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        const statusElement = document.getElementById("status");
        statusElement.textContent = "Copied to clipboard!";
        
        // Reset status after 2 seconds
        setTimeout(() => {
          statusElement.textContent = "Transcript extracted successfully!";
        }, 2000);
      })
      .catch(err => {
        const statusElement = document.getElementById("status");
        statusElement.textContent = "Failed to copy: " + err;
      });
  });
  
  // Find a good place to insert the button (after the transcript element)
  const transcriptElement = document.getElementById("transcript");
  transcriptElement.parentNode.insertBefore(copyButton, transcriptElement.nextSibling);
}

// Description-focused transcript extractor
function descriptionFocusedExtractor() {
  // Helper functions
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  
  // Function to extract transcript from visible panel with scrolling
  const extractFromVisiblePanel = async () => {
    // Find the transcript panel container
    const panelSelectors = [
      'ytd-transcript-search-panel-renderer',
      '.ytd-transcript-renderer',
      '[id*="transcript-panel"]',
      '[class*="transcript-panel"]',
      'ytd-transcript-renderer'
    ];
    
    let transcriptPanel = null;
    for (const selector of panelSelectors) {
      const panel = document.querySelector(selector);
      if (panel) {
        transcriptPanel = panel;
        break;
      }
    }
    
    if (!transcriptPanel) {
      return null;
    }
    
    // Find the scrollable container within the transcript panel
    const scrollableContainers = [
      transcriptPanel.querySelector('#contents'),
      transcriptPanel.querySelector('.ytd-transcript-renderer'),
      transcriptPanel.querySelector('[id*="content"]'),
      transcriptPanel.querySelector('[class*="content"]'),
      transcriptPanel.querySelector('div')
    ].filter(container => container !== null);
    
    let scrollContainer = null;
    for (const container of scrollableContainers) {
      if (container.scrollHeight > container.clientHeight) {
        scrollContainer = container;
        break;
      }
    }
    
    // If we found a scrollable container, scroll through it to load all content
    if (scrollContainer) {
      // Remember initial scroll position
      const initialScrollTop = scrollContainer.scrollTop;
      
      // Scroll to the top first
      scrollContainer.scrollTop = 0;
      await wait(300);
      
      // Scroll down in steps to load all content
      const scrollHeight = scrollContainer.scrollHeight;
      const clientHeight = scrollContainer.clientHeight;
      const scrollStep = clientHeight / 2; // Scroll half a page at a time
      
      for (let position = 0; position < scrollHeight; position += scrollStep) {
        scrollContainer.scrollTop = position;
        await wait(200); // Wait for content to load
      }
      
      // Scroll to the very bottom to ensure everything is loaded
      scrollContainer.scrollTop = scrollHeight;
      await wait(300);
      
      // Return to the original position
      scrollContainer.scrollTop = initialScrollTop;
      await wait(300);
    }
    
    // Now extract all the segments (should be fully loaded)
    const selectors = [
      'ytd-transcript-segment-renderer',
      '.ytd-transcript-renderer',
      '.transcript-segment',
      '[data-purpose="transcript-cue"]',
      '.caption-visual-line',
      '.segment-text',
      '[class*="transcript-segment"]',
      '[id*="transcript-segment"]'
    ];
    
    let transcriptSegments = [];
    
    // Try each selector until we find something
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements && elements.length > 0) {
        transcriptSegments = elements;
        break;
      }
    }
    
    if (transcriptSegments.length === 0) {
      return null;
    }
    
    // Extract text and timestamps
    let transcript = "";
    transcriptSegments.forEach(segment => {
      // Text selectors
      const textSelectors = [
        '#text', '.segment-text', '[class*="text"]',
        '.caption-visual-line', '.transcript-text'
      ];
      
      // Time selectors
      const timeSelectors = [
        '#timestamp', '.segment-timestamp', '[class*="time"]',
        '.transcript-timestamp', '[class*="timestamp"]'
      ];
      
      // Try to get text
      let text = "";
      for (const selector of textSelectors) {
        const element = segment.querySelector(selector);
        if (element) {
          text = element.textContent.trim();
          break;
        }
      }
      
      // If no text found with selectors, try the whole segment
      if (!text && segment.textContent) {
        text = segment.textContent.trim();
      }
      
      // Try to get timestamp
      let timestamp = "";
      for (const selector of timeSelectors) {
        const element = segment.querySelector(selector);
        if (element) {
          timestamp = element.textContent.trim();
          break;
        }
      }
      
      // Add to transcript if we found text
      if (text) {
        transcript += timestamp ? `[${timestamp}] ${text}\n` : `${text}\n`;
      }
    });
    
    return transcript || null;
  };
  
  // DESCRIPTION-FOCUSED METHOD: Find and click transcript button in description
  const findTranscriptInDescription = async () => {
    console.log("Looking for transcript button in description...");
    
    // 1. First, make sure description is expanded
    const expandDescription = async () => {
      // Various selectors for the "Show more" button in description
      const expandSelectors = [
        '#expand',
        '#more',
        '#description [aria-expanded="false"]',
        'ytd-expander[collapsed] #more',
        'tp-yt-paper-button#expand',
        'yt-formatted-string.more-button',
        '[aria-label="Show more"]',
        '#description-inline-expander [aria-expanded="false"]',
        '#description-inline-expander button'
      ];
      
      // Try each possible expand button
      for (const selector of expandSelectors) {
        const expandButtons = document.querySelectorAll(selector);
        for (const btn of expandButtons) {
          if (btn && btn.offsetParent !== null) { // Check if visible
            console.log('Expanding description:', btn);
            btn.click();
            await wait(800); // Wait for expansion
          }
        }
      }
    };
    
    // Try to expand the description first
    await expandDescription();
    
    // 2. Now search for transcript button in the description area
    const descAreaSelectors = [
      '#description',
      '#description-inline-expander',
      'ytd-expander',
      'ytd-text-inline-expander',
      '#meta-contents',
      'ytd-video-secondary-info-renderer',
      '#below',
      '#below-player-info',
      'ytd-watch-metadata'
    ];
    
    for (const areaSelector of descAreaSelectors) {
      const area = document.querySelector(areaSelector);
      if (!area) continue;
      
      console.log(`Searching in ${areaSelector}...`);
      
      // Look for ALL elements in this description area that might be the transcript button
      const allElements = area.querySelectorAll('*');
      
      for (const element of allElements) {
        // Check if this element contains text related to transcript
        const text = element.textContent.toLowerCase();
        
        if (text.includes('transcript') || text.includes('show transcript')) {
          // Make sure it's a clickable element
          if (element.tagName === 'BUTTON' || 
              element.tagName === 'A' || 
              element.getAttribute('role') === 'button' ||
              element.classList.contains('button') ||
              getComputedStyle(element).cursor === 'pointer') {
            
            console.log('Found transcript element in description:', element);
            
            // Try to click it
            element.click();
            
            // Wait longer and retry multiple times
            for (let attempt = 0; attempt < 5; attempt++) {
              await wait(1000); // Wait 1 second between attempts
              
              // Check if transcript appeared
              const transcript = await extractFromVisiblePanel();
              if (transcript) return transcript;
              
              console.log(`Attempt ${attempt + 1} failed, waiting more...`);
            }
            
            // If not, maybe we need to click on a parent or child element
            if (element.parentElement) {
              console.log('Trying parent element:', element.parentElement);
              element.parentElement.click();
              
              // Wait and retry for parent element too
              for (let attempt = 0; attempt < 3; attempt++) {
                await wait(1000);
                const transcript = await extractFromVisiblePanel();
                if (transcript) return transcript;
              }
            }
            
            // Try children
            const children = element.querySelectorAll('*');
            for (const child of children) {
              console.log('Trying child element:', child);
              child.click();
              
              // Wait and check
              for (let attempt = 0; attempt < 2; attempt++) {
                await wait(1000);
                const transcript = await extractFromVisiblePanel();
                if (transcript) return transcript;
              }
            }
          }
        }
      }
    }
    
    return null;
  };
  
  // Main function logic
  return new Promise(async (resolve) => {
    try {
      console.log("Starting transcript extraction...");
      
      // Method 0: Check if transcript is already visible
      let transcript = await extractFromVisiblePanel();
      if (transcript) {
        console.log("Found already open transcript panel");
        resolve({ transcript });
        return;
      }
      
      // Method 1: Look for transcript button in description area (NEW PRIMARY METHOD)
      console.log("Trying to find transcript button in description...");
      transcript = await findTranscriptInDescription();
      
      // If we found and clicked the transcript button but didn't get content yet,
      // wait a bit longer and try again to extract from the now-visible panel
      if (!transcript) {
        console.log("Transcript button may have been clicked, waiting for panel to load...");
        for (let retry = 0; retry < 3; retry++) {
          await wait(1500); // Wait 1.5 seconds
          transcript = await extractFromVisiblePanel();
          if (transcript) {
            console.log("Found transcript after waiting!");
            break;
          }
        }
      }
      
      if (transcript) {
        console.log("Successfully found transcript!");
        resolve({ transcript });
        return;
      }
      
      // Method 2: If description method fails, try other methods
      // (the rest of the code from previous methods would go here)
      
      // If all methods fail
      console.log("All automatic methods failed");
      resolve({ 
        error: "Could not automatically open transcript panel", 
        manualInstructions: 
          "Please open the transcript manually first:\n\n" +
          "1. Scroll down to the description area below the video\n" +
          "2. Look for and click on 'Show transcript' near the bottom of the description\n" +
          "3. Once the transcript panel is visible, click 'Extract Transcript' again"
      });
    } catch (error) {
      console.error("General error:", error);
      resolve({ error: "Extraction error: " + error.message });
    }
  });
}

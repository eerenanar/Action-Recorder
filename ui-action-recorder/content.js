(() => {
  let isRecording = false;
  let stepCounter = 0;

  // Load language preference
  chrome.storage.local.get(["isRecording", "lang"], (data) => {
    isRecording = data.isRecording === true;
    currentLang = data.lang || "tr";
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "SET_RECORDING") {
      isRecording = message.isRecording;
      if (message.resetSteps) stepCounter = 0;
    }
    if (message.type === "SET_LANGUAGE") {
      currentLang = message.lang || "tr";
    }
    if (message.type === "HIGHLIGHT_ELEMENT") {
      const found = highlightElement(message.xpath);
      sendResponse({ found });
      return true;
    }
  });

  // =============================================
  // SMART ELEMENT RESOLVER
  // Walk up from the raw click target to find the
  // meaningful interactive element (button, dropdown,
  // dropdown-option, checkbox, link, input, etc.)
  // =============================================

  function resolveElement(rawTarget) {
    let el = rawTarget;
    let depth = 0;

    while (el && depth < 10) {
      const tag = el.tagName?.toLowerCase();
      if (!tag) break;

      // --- Skip SVG internals, always go up ---
      if (["svg", "path", "g", "circle", "rect", "line", "polygon", "polyline", "use", "ellipse", "text", "tspan", "defs", "clippath", "mask"].includes(tag)) {
        el = el.parentElement;
        depth++;
        continue;
      }

      // --- Native interactive elements ---
      if (tag === "button") return { el, type: resolveButtonType(el) };
      if (tag === "a") return { el, type: "link" };
      if (tag === "input") return { el, type: resolveInputType(el) };
      if (tag === "textarea") return { el, type: "text area" };
      if (tag === "select") return { el, type: "dropdown" };
      if (tag === "option") return { el, type: "dropdown option" };
      if (tag === "label") return { el, type: "label" };

      const role = (el.getAttribute("role") || "").toLowerCase();
      if (role === "button") return { el, type: resolveButtonType(el) };
      if (role === "tab") return { el, type: "tab" };
      if (role === "menuitem") return { el, type: "menu item" };
      if (role === "option" || role === "listbox") return { el, type: "dropdown option" };
      if (role === "checkbox") return { el, type: "checkbox" };
      if (role === "radio") return { el, type: "radio" };
      if (role === "link") return { el, type: "link" };

      // --- Custom dropdown option patterns ---
      // data-attr-value is a common pattern for dropdown options
      if (el.hasAttribute("data-attr-value")) return { el, type: "dropdown option" };
      // Class-based detection for dropdown options
      if (hasClass(el, "dropdown-box__option", "dropdown-item", "option-item", "select-option", "list-item", "menu-item")) {
        return { el, type: "dropdown option" };
      }

      // --- Custom checkbox wrapper patterns ---
      if (hasClass(el, "check-box-wrapper", "checkbox-wrapper", "checkbox-item", "custom-checkbox")) {
        return { el, type: "checkbox" };
      }

      // --- Custom dropdown trigger patterns ---
      if (hasClass(el, "dropdown-wrapper", "select-wrapper", "dropdown-trigger", "dropdown-toggle", "select-trigger")) {
        return { el, type: "dropdown" };
      }

      // --- img ---
      if (tag === "img") return { el, type: "image" };

      // --- Headings ---
      if (/^h[1-6]$/.test(tag)) return { el, type: "heading" };

      // --- Table cells ---
      if (tag === "td" || tag === "th") return { el, type: "table cell" };

      // --- If element has a click handler hint or is clearly interactive ---
      if (el.onclick || el.hasAttribute("tabindex") || el.hasAttribute("data-action")) {
        // But only stop here if we can get meaningful info
        const info = extractText(el);
        if (info) return { el, type: guessTypeFromClasses(el) || tag };
      }

      el = el.parentElement;
      depth++;
    }

    // Nothing meaningful found — return raw target
    return { el: rawTarget, type: rawTarget.tagName?.toLowerCase() || "element" };
  }

  function resolveButtonType(el) {
    // Check if this button is actually a dropdown trigger
    const ph = el.querySelector("[placeholder]");
    if (ph) return "dropdown";
    if (hasClass(el, "dropdown", "select", "combobox")) return "dropdown";
    const cls = (el.className || "").toLowerCase();
    if (cls.includes("dropdown") || cls.includes("select")) return "dropdown";
    return "button";
  }

  function resolveInputType(el) {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "file") return "file input";
    if (type === "submit" || type === "button") return "button";
    return "text field";
  }

  function hasClass(el, ...patterns) {
    const cls = (el.className || "").toString().toLowerCase();
    return patterns.some((p) => cls.includes(p.toLowerCase()));
  }

  function guessTypeFromClasses(el) {
    const cls = (el.className || "").toString().toLowerCase();
    if (cls.includes("dropdown") || cls.includes("select")) return "dropdown";
    if (cls.includes("checkbox") || cls.includes("check-box")) return "checkbox";
    if (cls.includes("radio")) return "radio";
    if (cls.includes("btn") || cls.includes("button")) return "button";
    if (cls.includes("tab")) return "tab";
    return null;
  }

  // =============================================
  // TEXT EXTRACTION
  // Get the most meaningful label/text for any element
  // =============================================

  function extractText(element) {
    if (!element) return "";

    const tag = element.tagName.toLowerCase();

    // 1) placeholder (on element itself or child with placeholder)
    const ph = element.getAttribute("placeholder");
    if (ph) return ph;
    const childPh = element.querySelector("[placeholder]");
    if (childPh) {
      const p = childPh.getAttribute("placeholder");
      if (p) return p;
    }

    // 2) aria-label
    const aria = element.getAttribute("aria-label");
    if (aria) return aria;

    // 3) title attribute
    const title = element.getAttribute("title");
    if (title) return title;

    // 4) For dropdown options: look for option-text class or data-attr-value
    const optionText = element.querySelector("[class*='option-text'], [class*='item-text'], [class*='option-label']");
    if (optionText) {
      const t = optionText.textContent.trim();
      if (t) return t;
    }
    const dataVal = element.getAttribute("data-attr-value");
    if (dataVal) {
      // Also try to find a human-readable text inside
      const innerTitle = element.querySelector("[title]");
      if (innerTitle) return innerTitle.getAttribute("title");
      const innerText = element.textContent.trim();
      if (innerText && innerText.length <= 60) return innerText;
      // Capitalize data-attr-value as fallback
      return dataVal.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }

    // 5) For checkboxes: find label text
    if (tag === "input" || tag === "fieldset" || hasClass(element, "check-box", "checkbox")) {
      const label = findAssociatedLabelText(element);
      if (label) return label;
      // Look for checkbox text span
      const textSpan = element.querySelector("[class*='checkbox-text'], [class*='label-text']");
      if (textSpan) {
        const t = textSpan.getAttribute("title") || textSpan.textContent.trim();
        if (t) return t;
      }
      // Look for nearby title or text
      const nearTitle = element.querySelector("[title]");
      if (nearTitle) return nearTitle.getAttribute("title");
      // name attribute
      const name = element.querySelector("input[name]")?.getAttribute("name") || element.getAttribute("name");
      if (name) return name.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }

    // 6) Direct text nodes
    const directText = getDirectText(element);
    if (directText && directText.length <= 60) return directText;

    // 7) Full textContent for buttons/links (may contain icon text)
    if (tag === "button" || tag === "a") {
      const full = element.textContent.trim();
      if (full && full.length <= 60) return full;
    }

    // 8) alt attribute
    const alt = element.getAttribute("alt");
    if (alt) return alt;

    // 9) Associated label
    const label = findAssociatedLabelText(element);
    if (label) return label;

    // 10) For any element, try to find a title/text in children
    const anyTitle = element.querySelector("[title]");
    if (anyTitle) {
      const t = anyTitle.getAttribute("title");
      if (t) return t;
    }

    return "";
  }

  function getDirectText(element) {
    let text = "";
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    }
    return text.trim();
  }

  function findAssociatedLabelText(element) {
    if (element.id) {
      const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (label) {
        const t = label.textContent.trim();
        if (t && t.length <= 60) return t;
      }
    }
    const parentLabel = element.closest("label");
    if (parentLabel) {
      const t = getDirectText(parentLabel).trim();
      if (t && t.length <= 60) return t;
    }
    let prev = element.previousElementSibling;
    if (prev && prev.tagName === "LABEL") {
      const t = prev.textContent.trim();
      if (t && t.length <= 60) return t;
    }
    return "";
  }

  // =============================================
  // XPATH GENERATOR (unique, readable)
  // =============================================

  function getXPath(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = element.tagName.toLowerCase();

    // Always try to include text in XPath for better readability
    const text = extractText(element);

    const strategies = [
      () => tryByTestAttr(element, tag),
      () => tryByIdWithText(element, tag, text), // ID + placeholder/label for inputs, ID + text for others
      () => tryByNameWithText(element, tag, text), // Name + text combo
      () => tryByText(element, tag), // Text-based XPath
      () => tryByPlaceholder(element, tag),
      () => tryByChildPlaceholder(element, tag),
      () => tryByAriaLabel(element, tag),
      () => tryByClassAndText(element, tag), // Text + class combo
      () => tryById(element, tag), // Fallback: ID only
      () => tryByDataAttrValue(element, tag),
      () => tryByName(element, tag), // Fallback: Name only
      () => tryByTitle(element, tag),
      () => tryBySvgContext(element, tag), // SVG special handling
      () => buildAnchoredPath(element),
    ];

    for (const strategy of strategies) {
      const xpath = strategy();
      if (xpath) return xpath;
    }
    return buildAnchoredPath(element) || `//${tag}`;
  }

  function isUnique(xpath) {
    try {
      const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      return result.snapshotLength === 1;
    } catch { return false; }
  }

  function tryByDataAttrValue(el, tag) {
    const val = el.getAttribute("data-attr-value");
    if (!val) return null;
    const x = `//*[@data-attr-value="${val}"]`;
    if (isUnique(x)) return x;
    return null;
  }

  function tryById(el, tag) {
    if (!el.id) return null;
    const simple = `//*[@id="${el.id}"]`;
    if (isUnique(simple)) return simple;
    // Not unique — combine
    const ph = el.getAttribute("placeholder");
    if (ph) { const x = `//${tag}[@id="${el.id}" and @placeholder="${ph}"]`; if (isUnique(x)) return x; }
    const childPh = el.querySelector("[placeholder]");
    if (childPh) {
      const p = childPh.getAttribute("placeholder");
      if (p) { const x = `//${tag}[@id="${el.id}" and .//p[@placeholder="${p}"]]`; if (isUnique(x)) return x; }
    }
    const label = findAssociatedLabelText(el);
    if (label) { const x = `//${tag}[@id="${el.id}" and ancestor::*[contains(normalize-space(),"${label}")]]`; if (isUnique(x)) return x; }
    const name = el.getAttribute("name");
    if (name) { const x = `//${tag}[@id="${el.id}" and @name="${name}"]`; if (isUnique(x)) return x; }
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) { const x = `//${tag}[@id="${el.id}" and @aria-label="${ariaLabel}"]`; if (isUnique(x)) return x; }
    const allSameId = document.querySelectorAll(`[id="${CSS.escape(el.id)}"]`);
    if (allSameId.length > 1) {
      const idx = Array.from(allSameId).indexOf(el) + 1;
      return `(//*[@id="${el.id}"])[${idx}]`;
    }
    return simple;
  }

  function tryByTestAttr(el, tag) {
    for (const attr of ["data-testid", "data-test", "data-cy", "data-qa"]) {
      const val = el.getAttribute(attr);
      if (val) { const x = `//*[@${attr}="${val}"]`; if (isUnique(x)) return x; }
    }
    return null;
  }

  function tryByIdWithText(el, tag, text) {
    if (!el.id) return null;

    // For input/textarea, use placeholder or label instead of text content
    if (["input", "textarea"].includes(tag)) {
      const placeholder = el.getAttribute("placeholder");
      if (placeholder && placeholder.length <= 60) {
        const x = `//${tag}[@id="${el.id}" and @placeholder="${placeholder}"]`;
        if (isUnique(x)) return x;
      }

      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel && ariaLabel.length <= 60) {
        const x = `//${tag}[@id="${el.id}" and @aria-label="${ariaLabel}"]`;
        if (isUnique(x)) return x;
      }

      const labelText = findAssociatedLabelText(el);
      if (labelText && labelText.length <= 60) {
        const x = `//${tag}[@id="${el.id}"]`; // Keep ID simple for inputs with labels
        if (isUnique(x)) return x;
      }

      return null;
    }

    // For other elements, use text content
    if (!text || text.length > 60) return null;
    const x = `//${tag}[@id="${el.id}" and contains(normalize-space(), "${text}")]`;
    if (isUnique(x)) return x;
    return null;
  }

  function tryByNameWithText(el, tag, text) {
    const name = el.getAttribute("name");
    if (!name || !text || text.length > 60) return null;
    // Try name with text content
    const x = `//${tag}[@name="${name}" and contains(normalize-space(), "${text}")]`;
    if (isUnique(x)) return x;
    return null;
  }

  function tryByName(el, tag) {
    const name = el.getAttribute("name");
    if (!name) return null;
    const x = `//${tag}[@name="${name}"]`;
    if (isUnique(x)) return x;
    return null;
  }

  function tryByAriaLabel(el, tag) {
    const ariaLabel = el.getAttribute("aria-label");
    if (!ariaLabel) return null;
    const x = `//${tag}[@aria-label="${ariaLabel}"]`;
    if (isUnique(x)) return x;
    return null;
  }

  function tryByPlaceholder(el, tag) {
    const ph = el.getAttribute("placeholder");
    if (!ph) return null;
    const x = `//${tag}[@placeholder="${ph}"]`;
    if (isUnique(x)) return x;
    return null;
  }

  function tryByChildPlaceholder(el, tag) {
    const childPh = el.querySelector("[placeholder]");
    if (!childPh) return null;
    const ph = childPh.getAttribute("placeholder");
    if (!ph) return null;
    const x = `//${tag}[.//*[@placeholder="${ph}"]]`;
    if (isUnique(x)) return x;
    // Try with child tag
    const childTag = childPh.tagName.toLowerCase();
    const x2 = `//${tag}[./${childTag}[@placeholder="${ph}"]]`;
    if (isUnique(x2)) return x2;
    return null;
  }

  function tryByTitle(el, tag) {
    const title = el.getAttribute("title");
    if (!title) return null;
    const x = `//${tag}[@title="${title}"]`;
    if (isUnique(x)) return x;
    return null;
  }

  function tryByText(el, tag) {
    const interactiveTags = ["button", "a", "label", "th", "h1", "h2", "h3", "h4", "h5", "h6", "span", "li", "div", "option", "input", "textarea"];
    if (!interactiveTags.includes(tag)) return null;

    // For input/textarea, try with placeholder text
    if (["input", "textarea"].includes(tag)) {
      const placeholder = el.getAttribute("placeholder");
      if (placeholder && placeholder.length <= 60) {
        const x = `//${tag}[@placeholder="${placeholder}"]`;
        if (isUnique(x)) return x;
      }
      // Try with aria-label
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel && ariaLabel.length <= 60) {
        const x = `//${tag}[@aria-label="${ariaLabel}"]`;
        if (isUnique(x)) return x;
      }
      // Try with label text
      const labelText = findAssociatedLabelText(el);
      if (labelText && labelText.length <= 60) {
        const x = `//${tag}[ancestor::label[contains(normalize-space(), "${labelText}")] or @id=//label[contains(normalize-space(), "${labelText}")]/@for]`;
        if (isUnique(x)) return x;
      }
      return null;
    }

    // Try direct text first
    const directText = getDirectText(el).trim();
    if (directText && directText.length <= 60) {
      const x = `//${tag}[normalize-space()="${directText}"]`;
      if (isUnique(x)) return x;
    }

    // For divs and spans, try full text content (for dropdown options, menu items, etc.)
    if (["div", "span", "li"].includes(tag)) {
      const fullText = el.textContent.trim();
      if (fullText && fullText.length <= 60 && fullText.length > 0) {
        const x = `//${tag}[normalize-space()="${fullText}"]`;
        if (isUnique(x)) return x;

        // Try with contains if exact match doesn't work
        const x2 = `//${tag}[contains(normalize-space(), "${fullText}")]`;
        if (isUnique(x2)) return x2;
      }
    }

    return null;
  }

  function tryByClassAndText(el, tag) {
    // For dropdown options and interactive elements with text content
    const text = el.textContent.trim();

    // Try with data-attr-value + text content FIRST (most specific)
    if (el.hasAttribute("data-attr-value") && text && text.length <= 60) {
      const val = el.getAttribute("data-attr-value");
      const x = `//*[@data-attr-value="${val}" and normalize-space()="${text}"]`;
      if (isUnique(x)) return x;

      // Try with contains for partial match
      const x2 = `//*[@data-attr-value="${val}" and contains(normalize-space(), "${text}")]`;
      if (isUnique(x2)) return x2;
    }

    // Try with title attribute if exists
    const title = el.querySelector("[title]");
    if (title) {
      const t = title.getAttribute("title");
      if (t && t.length <= 60) {
        // Title + text combo
        if (text && text.length <= 60) {
          const x = `//*[@title="${t}" and contains(normalize-space(), "${text}")]`;
          if (isUnique(x)) return x;
        }
        // Title only
        const x2 = `//*[@title="${t}"]`;
        if (isUnique(x2)) return x2;
      }
    }

    // Try with text content for dropdown options and interactive elements
    if (text && text.length <= 60) {
      // Try exact text match with tag
      const x1 = `//${tag}[normalize-space()="${text}"]`;
      if (isUnique(x1)) return x1;

      // Try with common dropdown/option class patterns + text
      const commonClasses = ["option", "item", "dropdown", "menu", "select"];
      for (const cls of commonClasses) {
        if (el.className && el.className.toString().toLowerCase().includes(cls)) {
          const x2 = `//${tag}[contains(@class, "${cls}") and normalize-space()="${text}"]`;
          if (isUnique(x2)) return x2;

          // Try with contains
          const x3 = `//${tag}[contains(@class, "${cls}") and contains(normalize-space(), "${text}")]`;
          if (isUnique(x3)) return x3;
        }
      }
    }

    return null;
  }

  function tryBySvgContext(el, tag) {
    // Special handling for SVG elements
    if (tag !== "svg" && !el.closest("svg")) return null;

    // Try to find parent button or clickable element with text
    let parent = el.parentElement;
    let depth = 0;
    while (parent && depth < 5) {
      const parentTag = parent.tagName.toLowerCase();
      const parentText = getDirectText(parent).trim() || parent.textContent.trim();

      // If parent is a button or clickable element with text, use that
      if (["button", "a", "div", "span"].includes(parentTag) && parentText && parentText.length <= 60) {
        // Check if parent has useful attributes
        if (parent.id) {
          const x = `//${parentTag}[@id="${parent.id}" and contains(normalize-space(), "${parentText}")]`;
          if (isUnique(x)) return x;
        }

        const ariaLabel = parent.getAttribute("aria-label");
        if (ariaLabel && ariaLabel.length <= 60) {
          const x = `//${parentTag}[@aria-label="${ariaLabel}"]//svg`;
          if (isUnique(x)) return x;
        }

        // Try with text content
        const x = `//${parentTag}[contains(normalize-space(), "${parentText}")]//svg`;
        if (isUnique(x)) return x;

        // Try exact match
        const x2 = `//${parentTag}[normalize-space()="${parentText}"]//svg`;
        if (isUnique(x2)) return x2;
      }

      parent = parent.parentElement;
      depth++;
    }

    return null;
  }

  function buildAnchoredPath(element) {
    const tag = element.tagName.toLowerCase();
    const text = element.textContent?.trim();

    // Before positional fallback: try parent context + text combo
    if (text && text.length > 0 && text.length <= 60) {
      let parent = element.parentElement;
      let pDepth = 0;
      while (parent && pDepth < 8) {
        // Parent ID + child text
        if (parent.id) {
          const x = `//*[@id="${parent.id}"]//${tag}[normalize-space()="${text}"]`;
          if (isUnique(x)) return x;
          const x2 = `//*[@id="${parent.id}"]//*[normalize-space()="${text}"]`;
          if (isUnique(x2)) return x2;
        }
        // Parent class + child text
        if (parent.className && typeof parent.className === "string") {
          const cls = parent.className.split(/\s+/).find(c => c.length > 2);
          if (cls) {
            const x = `//*[contains(@class,"${cls}")]//${tag}[normalize-space()="${text}"]`;
            if (isUnique(x)) return x;
            const x2 = `//*[contains(@class,"${cls}")]//*[normalize-space()="${text}"]`;
            if (isUnique(x2)) return x2;
          }
        }
        // Parent role + child text
        const role = parent.getAttribute("role");
        if (role && ["listbox", "menu", "list", "dialog", "dropdown", "presentation", "group"].includes(role)) {
          const x = `//*[@role="${role}"]//${tag}[normalize-space()="${text}"]`;
          if (isUnique(x)) return x;
        }
        parent = parent.parentElement;
        pDepth++;
      }
    }

    // Original positional fallback
    const parts = [];
    let current = element;
    let depth = 0;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement && depth < 5) {
      const ctag = current.tagName.toLowerCase();
      if (current.id && depth > 0) {
        const idXpath = `//*[@id="${current.id}"]`;
        if (isUnique(idXpath)) {
          parts.unshift(idXpath);
          const fullPath = parts.join("/");
          if (isUnique(fullPath)) return fullPath;
        }
      }
      const index = getPositionIndex(current);
      const segment = index > 0 ? `${ctag}[${index}]` : ctag;
      parts.unshift(segment);
      current = current.parentElement;
      depth++;
    }
    return "//" + parts.join("/");
  }

  function getPositionIndex(element) {
    const tag = element.tagName;
    let prev = 0;
    let s = element.previousElementSibling;
    while (s) { if (s.tagName === tag) prev++; s = s.previousElementSibling; }
    s = element.nextElementSibling;
    let hasNext = false;
    while (s) { if (s.tagName === tag) { hasNext = true; break; } s = s.nextElementSibling; }
    if (prev === 0 && !hasNext) return 0;
    return prev + 1;
  }

  // =============================================
  // DESCRIPTION BUILDER
  // =============================================

  function buildDescription(action, resolvedEl, resolvedType, extra) {
    const text = extractText(resolvedEl);

    switch (action) {
      case "click": {
        if (resolvedType === "dropdown") {
          return text ? t("dropdownClicked", { text }) : t("dropdownClickedNoText");
        }
        if (resolvedType === "dropdown option") {
          return text ? t("optionClicked", { text }) : t("optionClickedNoText");
        }
        if (resolvedType === "button") {
          return text ? t("buttonClicked", { text }) : t("buttonClickedNoText");
        }
        if (resolvedType === "link") {
          return text ? t("linkClicked", { text }) : t("linkClickedNoText");
        }
        if (resolvedType === "checkbox") {
          return text ? t("checkboxClicked", { text }) : t("checkboxClickedNoText");
        }
        if (resolvedType === "radio") {
          return text ? t("radioSelected", { text }) : t("radioSelectedNoText");
        }
        if (resolvedType === "tab") {
          return text ? t("tabClicked", { text }) : t("tabClickedNoText");
        }
        if (resolvedType === "text field" || resolvedType === "text area") {
          return text ? t("fieldClicked", { text }) : t("fieldClickedNoText");
        }
        if (resolvedType === "image") {
          return text ? t("imageClicked", { text }) : t("imageClickedNoText");
        }
        if (resolvedType === "menu item") {
          return text ? t("menuItemClicked", { text }) : t("menuItemClickedNoText");
        }
        if (text) return t("elementClicked", { text });
        return t("elementClickedGeneric", { type: resolvedType });
      }
      case "dblclick": {
        return text ? t("elementDblClicked", { text }) : t("elementDblClickedGeneric", { type: resolvedType });
      }
      case "input": {
        const label = text || resolvedType;
        const val = extra.value || "";
        if (val) return t("inputTyped", { label, value: val.substring(0, 40) });
        return t("inputEntered", { label });
      }
      case "change": {
        const label = text || resolvedType;
        if (extra.selectedText) return t("selectChanged", { label, selectedText: extra.selectedText });
        if (extra.checked !== undefined) return extra.checked ? t("checked", { label }) : t("unchecked", { label });
        return t("fieldChanged", { label });
      }
      case "submit": return text ? t("formSubmittedWith", { text }) : t("formSubmitted");
      case "keydown": {
        const modifiers = [extra.ctrlKey && "Ctrl", extra.shiftKey && "Shift", extra.altKey && "Alt"].filter(Boolean).join("+");
        const combo = modifiers ? `${modifiers}+${extra.key}` : extra.key;
        return t("keyPressed", { combo });
      }
      case "contextmenu": {
        return text ? t("rightClicked", { text }) : t("rightClickedGeneric", { type: resolvedType });
      }
      default: return t("genericAction", { action });
    }
  }

  // =============================================
  // RECORD BUILDING & SENDING
  // =============================================

  function buildRecord(action, rawTarget, extra = {}) {
    const { el: resolvedEl, type: resolvedType } = resolveElement(rawTarget);
    stepCounter++;
    return {
      step: stepCounter,
      timestamp: new Date().toISOString(),
      action,
      description: buildDescription(action, resolvedEl, resolvedType, extra),
      xpath: getXPath(resolvedEl),
      tagName: resolvedEl.tagName.toLowerCase(),
      url: window.location.href,
      ...extra,
    };
  }

  function sendAction(record) {
    if (!isRecording) return;
    chrome.runtime.sendMessage({ type: "RECORD_ACTION", data: record });
  }

  // =============================================
  // EVENT LISTENERS
  // =============================================

  document.addEventListener("click", (e) => {
    const extra = {};
    if (e.target.type === "checkbox") extra.checked = e.target.checked;
    sendAction(buildRecord("click", e.target, extra));
  }, true);

  document.addEventListener("dblclick", (e) => {
    sendAction(buildRecord("dblclick", e.target));
  }, true);

  let inputTimer = null;
  let lastInputTarget = null;
  document.addEventListener("input", (e) => {
    if (!isRecording) return;
    clearTimeout(inputTimer);
    lastInputTarget = e.target;
    inputTimer = setTimeout(() => {
      sendAction(buildRecord("input", lastInputTarget, { value: lastInputTarget.value || "" }));
    }, 500);
  }, true);

  document.addEventListener("change", (e) => {
    const target = e.target;
    const extra = {};
    if (target.type === "checkbox" || target.type === "radio") {
      extra.checked = target.checked;
      extra.value = target.value;
    } else if (target.tagName === "SELECT") {
      extra.value = target.value;
      extra.selectedText = target.options[target.selectedIndex]?.text || "";
    } else {
      return;
    }
    sendAction(buildRecord("change", target, extra));
  }, true);

  document.addEventListener("submit", (e) => {
    sendAction(buildRecord("submit", e.target));
  }, true);

  document.addEventListener("keydown", (e) => {
    if (!["Enter", "Tab", "Escape", "Delete", "Backspace"].includes(e.key)) return;
    sendAction(buildRecord("keydown", e.target, {
      key: e.key, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey,
    }));
  }, true);

  document.addEventListener("contextmenu", (e) => {
    sendAction(buildRecord("contextmenu", e.target));
  }, true);

  // =============================================
  // HIGHLIGHT ELEMENT ON PAGE
  // =============================================

  function highlightElement(xpath) {
    try {
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      const element = result.singleNodeValue;

      if (!element) return false;

      // Remove any existing highlight
      const existingHighlight = document.getElementById("ui-action-recorder-highlight");
      if (existingHighlight) existingHighlight.remove();

      // Create highlight overlay
      const rect = element.getBoundingClientRect();
      const highlight = document.createElement("div");
      highlight.id = "ui-action-recorder-highlight";
      highlight.style.cssText = `
        position: fixed;
        top: ${rect.top}px;
        left: ${rect.left}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        border: 3px dashed #e53935;
        background: rgba(229, 57, 53, 0.1);
        pointer-events: none;
        z-index: 999999;
        box-shadow: 0 0 0 2px white, 0 0 10px rgba(229, 57, 53, 0.5);
        animation: ui-action-recorder-pulse 1s ease-in-out infinite;
      `;

      // Add animation
      const style = document.createElement("style");
      style.textContent = `
        @keyframes ui-action-recorder-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.02); }
        }
      `;
      document.head.appendChild(style);

      document.body.appendChild(highlight);

      // Scroll into view
      element.scrollIntoView({ behavior: "smooth", block: "center" });

      // Remove after 3 seconds
      setTimeout(() => {
        highlight.remove();
        style.remove();
      }, 3000);

      return true;
    } catch (error) {
      console.error("XPath highlight error:", error);
      return false;
    }
  }
})();

/**
 * MascotBot Voice Widget — WordPress drop-in embed script with conversation continuity.
 *
 * Usage:
 *   <script src="https://widget.yourdomain.com/widget.js" async></script>
 *
 * Options (via data-attributes on the script tag):
 *   data-widget-url           Override the widget URL (auto-detected from script src)
 *   data-widget-width         Desktop iframe width (default 350)
 *   data-widget-height        Desktop iframe height (default 450)
 *   data-widget-mobile-width  Mobile iframe width
 *   data-widget-mobile-height Mobile iframe height
 *   data-widget-mobile-breakpoint  Viewport px at which mobile sizes kick in (default 768)
 *
 * The widget mounts in an iframe at the configured URL. Clicks pass through to
 * the page except when over the call button area — a sensor overlay tracks the
 * cursor and toggles iframe pointer-events to match. When the agent calls
 * navigateTo, the iframe posts a widget-navigate message and this script runs
 * window.location.href = page, forcing a hard reload. Because the iframe's
 * sessionStorage is scoped to the widget origin (not the parent), the
 * conversation buffer survives that reload and the widget auto-resumes on the
 * next page.
 */
(function () {
  if (window.__MASCOTBOT_WIDGET_MOUNTED__) return;
  window.__MASCOTBOT_WIDGET_MOUNTED__ = true;

  var scriptTag = document.currentScript;

  function getWidgetUrlFromScript() {
    if (!scriptTag || !scriptTag.src) return null;
    try {
      return new URL(scriptTag.src).origin;
    } catch (e) {
      return null;
    }
  }

  var widgetUrl =
    (scriptTag && scriptTag.getAttribute("data-widget-url")) ||
    window.WIDGET_URL ||
    getWidgetUrlFromScript() ||
    window.location.origin;

  var desktopWidth = parseInt(
    (scriptTag && scriptTag.getAttribute("data-widget-width")) || "350",
    10,
  );
  var desktopHeight = parseInt(
    (scriptTag && scriptTag.getAttribute("data-widget-height")) || "450",
    10,
  );
  var mobileWidth = parseInt(
    (scriptTag && scriptTag.getAttribute("data-widget-mobile-width")) ||
      desktopWidth,
    10,
  );
  var mobileHeight = parseInt(
    (scriptTag && scriptTag.getAttribute("data-widget-mobile-height")) ||
      desktopHeight,
    10,
  );
  var mobileBreakpoint = parseInt(
    (scriptTag && scriptTag.getAttribute("data-widget-mobile-breakpoint")) ||
      "768",
    10,
  );

  // Button-area geometry inside the iframe — must match widget container/button layout.
  var BUTTON_WIDTH_PERCENT = 0.5;
  var BUTTON_HEIGHT_PERCENT = 0.2;

  function isMobile() {
    return window.innerWidth <= mobileBreakpoint;
  }

  function getCurrentDimensions() {
    return isMobile()
      ? { width: mobileWidth, height: mobileHeight }
      : { width: desktopWidth, height: desktopHeight };
  }

  var dim = getCurrentDimensions();
  var width = dim.width;
  var height = dim.height;

  var iframe = document.createElement("iframe");
  iframe.src = widgetUrl;
  iframe.allow = "microphone; autoplay";
  iframe.title = "Voice Chat Widget";
  iframe.setAttribute("aria-label", "Voice chat widget");
  iframe.style.cssText =
    "position:fixed;bottom:0;right:0;width:" +
    width +
    "px;height:" +
    height +
    "px;border:none;background:transparent;pointer-events:none;z-index:2147483646;color-scheme:normal;";

  var sensor = document.createElement("div");
  sensor.setAttribute("aria-hidden", "true");
  sensor.style.cssText =
    "position:fixed;bottom:0;right:0;width:" +
    width * BUTTON_WIDTH_PERCENT +
    "px;height:" +
    height * BUTTON_HEIGHT_PERCENT +
    "px;z-index:2147483647;pointer-events:auto;cursor:pointer;";

  function enableIframe() {
    iframe.style.pointerEvents = "auto";
    sensor.style.pointerEvents = "none";
  }

  function disableIframe() {
    iframe.style.pointerEvents = "none";
    sensor.style.pointerEvents = "auto";
  }

  function isInButtonArea(x, y) {
    var rect = iframe.getBoundingClientRect();
    var buttonLeft = rect.right - rect.width * BUTTON_WIDTH_PERCENT;
    var buttonTop = rect.bottom - rect.height * BUTTON_HEIGHT_PERCENT;
    return (
      x >= buttonLeft && x <= rect.right && y >= buttonTop && y <= rect.bottom
    );
  }

  sensor.addEventListener("mouseenter", enableIframe);

  document.addEventListener("mousemove", function (e) {
    if (iframe.style.pointerEvents === "auto") {
      if (!isInButtonArea(e.clientX, e.clientY)) disableIframe();
    }
  });

  sensor.addEventListener(
    "touchstart",
    function (e) {
      if (!iframe.contentWindow) return;
      var t = e.touches[0];
      var rect = iframe.getBoundingClientRect();
      iframe.contentWindow.postMessage(
        {
          type: "widget-tap",
          x: t.clientX - rect.left,
          y: t.clientY - rect.top,
        },
        "*",
      );
    },
    { passive: true },
  );

  sensor.addEventListener("click", function (e) {
    if (!iframe.contentWindow) return;
    var rect = iframe.getBoundingClientRect();
    iframe.contentWindow.postMessage(
      { type: "widget-tap", x: e.clientX - rect.left, y: e.clientY - rect.top },
      "*",
    );
  });

  function informCurrentPage() {
    if (!iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      { type: "widget-current-page", pathname: window.location.pathname },
      "*",
    );
  }

  iframe.addEventListener("load", function () {
    // Retry a few times — the React app may not have attached its message
    // listener on the very first load tick.
    var attempts = 0;
    var id = setInterval(function () {
      informCurrentPage();
      if (++attempts >= 4) clearInterval(id);
    }, 150);
  });

  window.addEventListener("message", function (e) {
    var data = e && e.data;
    if (!data || typeof data !== "object" || typeof data.type !== "string")
      return;

    if (data.type === "widget-mouse-left-button") {
      disableIframe();
      return;
    }

    if (data.type === "widget-navigate" && typeof data.page === "string") {
      // Hard reload to the requested page. sessionStorage on the widget origin
      // (iframe) survives — the widget will auto-resume on the next page.
      try {
        window.location.href = data.page;
      } catch (err) {
        console.error("[MascotBot widget] navigate failed:", err);
      }
      return;
    }

    if (data.type === "widget-form-update" || data.type === "widget-form-submit") {
      // Re-broadcast on window so demo-site components can subscribe.
      try {
        window.dispatchEvent(
          new CustomEvent("mascotbot-widget-message", { detail: data }),
        );
      } catch (err) {
        /* ignore */
      }
      return;
    }
  });

  window.addEventListener("resize", function () {
    var next = getCurrentDimensions();
    if (next.width !== width || next.height !== height) {
      width = next.width;
      height = next.height;
      iframe.style.width = width + "px";
      iframe.style.height = height + "px";
    }
    var rect = iframe.getBoundingClientRect();
    sensor.style.width = rect.width * BUTTON_WIDTH_PERCENT + "px";
    sensor.style.height = rect.height * BUTTON_HEIGHT_PERCENT + "px";
  });

  // Expose a small API so demo-site (or anyone) can push events to the widget.
  window.MascotBotWidget = {
    sendFormEdit: function (field, value) {
      if (!iframe.contentWindow) return;
      iframe.contentWindow.postMessage(
        { type: "widget-form-user-edit", field: String(field), value: String(value) },
        "*",
      );
    },
  };

  function mount() {
    document.body.appendChild(iframe);
    document.body.appendChild(sensor);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();

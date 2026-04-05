import React, { useState, useCallback } from 'react'
import { View, StyleSheet } from 'react-native'

// Lazy-load WebView to avoid TurboModule crash in Expo Go.
let WebView: typeof import('react-native-webview').WebView | null = null
try {
  WebView = require('react-native-webview').WebView
} catch {
  WebView = null
}

interface Props {
  html: string
  /** Optional cap in points — content taller than this is clipped. */
  maxHeight?: number
}

/**
 * Builds a minimal read-only HTML document with the same CSS rules used by
 * RichTextEditor, so H1/H2, bold, italic, underline, blockquote, and lists
 * all render with the correct visual styling.
 */
function buildHtml(html: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: transparent; }
  body {
    font-size: 16px;
    line-height: 1.7;
    color: #F5F5F5;
    font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
    word-break: break-word;
  }
  h1 { font-size: 22px; font-weight: 700; margin: 8px 0 4px; line-height: 1.3; }
  h2 { font-size: 18px; font-weight: 600; margin: 6px 0 4px; line-height: 1.4; }
  ul, ol { padding-left: 22px; margin: 4px 0; }
  li { margin: 2px 0; }
  b, strong { font-weight: 700; }
  i, em { font-style: italic; }
  u { text-decoration: underline; }
  blockquote {
    border-left: 3px solid #4CD964;
    padding-left: 12px;
    margin: 6px 0;
    color: #aaa;
  }
</style>
</head>
<body>${html}</body>
</html>`
}

/**
 * Read-only WebView renderer for rich_text (HTML) post content.
 *
 * Auto-sizes to its rendered content height by injecting a small script that
 * reports scrollHeight after the DOM loads. The wrapping View uses
 * pointerEvents="none" so touches pass through to the parent card/scroll view.
 *
 * Falls back to null in Expo Go where the WebView native module is unavailable.
 */
export function RichTextRenderer({ html, maxHeight }: Props) {
  const [height, setHeight] = useState(40)

  const handleMessage = useCallback(
    (e: { nativeEvent: { data: string } }) => {
      try {
        const parsed = JSON.parse(e.nativeEvent.data) as { height: number }
        const h = parsed.height
        if (typeof h === 'number' && h > 0) {
          setHeight(maxHeight ? Math.min(h, maxHeight) : h)
        }
      } catch {}
    },
    [maxHeight],
  )

  if (!WebView) return null

  return (
    <View style={{ height }} pointerEvents="none">
      <WebView
        source={{ html: buildHtml(html) }}
        style={[styles.webView, { height }]}
        scrollEnabled={false}
        onMessage={handleMessage}
        injectedJavaScript={`
          (function() {
            window.ReactNativeWebView.postMessage(
              JSON.stringify({ height: document.documentElement.scrollHeight })
            );
          })();
          true;
        `}
        showsVerticalScrollIndicator={false}
        originWhitelist={['*']}
        javaScriptEnabled
      />
    </View>
  )
}

const styles = StyleSheet.create({
  webView: {
    backgroundColor: 'transparent',
  },
})

import React, { forwardRef, useImperativeHandle, useRef, useCallback, useState } from 'react'
import { View, TouchableOpacity, Text, TextInput, StyleSheet } from 'react-native'
import { colors, spacing, radius, typography } from '../../theme/tokens'

// Lazy-load WebView to avoid TurboModule crash in Expo Go.
// Falls back to null when the native module is unavailable.
let WebView: typeof import('react-native-webview').WebView | null = null
try {
  WebView = require('react-native-webview').WebView
} catch {
  WebView = null
}

// ─── Public handle ────────────────────────────────────────────────────────────

export interface RichTextEditorHandle {
  /** Returns the current editor HTML. Resolves after the WebView responds. */
  getHTML: () => Promise<string>
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  placeholder?: string
  /** Called on every content change with the raw HTML string. */
  onChange?: (html: string) => void
  /** Visible height of the editor WebView in points. Default: 300. */
  height?: number
}

// ─── Editor HTML ──────────────────────────────────────────────────────────────

function buildEditorHtml(placeholder: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { height: 100%; background: #010101; }
  #editor {
    padding: 4px 2px;
    outline: none;
    font-size: 16px;
    line-height: 1.7;
    color: #F5F5F5;
    font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
    word-break: break-word;
    min-height: 100%;
  }
  #editor:empty:before {
    content: "${placeholder.replace(/"/g, '\\"')}";
    color: #555;
    pointer-events: none;
    display: block;
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
<body>
<div id="editor" contenteditable="true" spellcheck="true"></div>
<script>
  var editor = document.getElementById('editor');

  editor.addEventListener('input', function() {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: 'change', html: editor.innerHTML })
    );
  });

  // Called via injectJavaScript to run a formatting command
  window.execCmd = function(cmd, value) {
    editor.focus();
    document.execCommand(cmd, false, value || null);
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: 'change', html: editor.innerHTML })
    );
  };

  // Called via injectJavaScript to resolve getHTML()
  window.getContent = function() {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: 'content', html: editor.innerHTML })
    );
  };

  setTimeout(function() { editor.focus(); }, 150);
</script>
</body>
</html>`
}

// ─── Toolbar config ───────────────────────────────────────────────────────────

const TOOLBAR_ITEMS: { label: string; cmd: string; value: string | null }[] = [
  { label: 'B',  cmd: 'bold',                value: null },
  { label: 'I',  cmd: 'italic',              value: null },
  { label: 'U',  cmd: 'underline',           value: null },
  { label: 'H1', cmd: 'formatBlock',         value: 'H1' },
  { label: 'H2', cmd: 'formatBlock',         value: 'H2' },
  { label: '•',  cmd: 'insertUnorderedList', value: null },
  { label: '1.', cmd: 'insertOrderedList',   value: null },
  { label: '"',  cmd: 'formatBlock',         value: 'BLOCKQUOTE' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(
  ({ placeholder = 'Write your article…', onChange, height = 300 }, ref) => {
    const webViewRef = useRef<InstanceType<NonNullable<typeof WebView>>>(null)
    const resolverRef = useRef<((html: string) => void) | null>(null)
    const [fallbackText, setFallbackText] = useState('')

    // When WebView is unavailable (Expo Go), expose fallback text as HTML
    useImperativeHandle(ref, () => ({
      getHTML: () => {
        if (!WebView) {
          return Promise.resolve(`<p>${fallbackText}</p>`)
        }
        return new Promise<string>((resolve) => {
          resolverRef.current = resolve
          webViewRef.current?.injectJavaScript('window.getContent(); true;')
        })
      },
    }))

    const execCommand = useCallback((cmd: string, value: string | null) => {
      if (!WebView) return
      const js = `window.execCmd(${JSON.stringify(cmd)}, ${value ? JSON.stringify(value) : 'null'}); true;`
      webViewRef.current?.injectJavaScript(js)
    }, [])

    const handleMessage = useCallback(
      (event: { nativeEvent: { data: string } }) => {
        try {
          const msg = JSON.parse(event.nativeEvent.data) as { type: string; html: string }
          if (msg.type === 'change') {
            onChange?.(msg.html)
          } else if (msg.type === 'content' && resolverRef.current) {
            resolverRef.current(msg.html ?? '')
            resolverRef.current = null
          }
        } catch {}
      },
      [onChange],
    )

    // ── Expo Go fallback — WebView native module not available ──────────────
    if (!WebView) {
      return (
        <View style={styles.container}>
          <View style={styles.toolbar}>
            <Text style={styles.fallbackNote}>
              Rich text requires a dev build — plain text mode active
            </Text>
          </View>
          <TextInput
            value={fallbackText}
            onChangeText={(t) => { setFallbackText(t); onChange?.(`<p>${t}</p>`) }}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            style={[styles.fallbackInput, { height }]}
            multiline
            textAlignVertical="top"
          />
        </View>
      )
    }

    return (
      <View style={styles.container}>
        {/* Formatting toolbar — native RN buttons */}
        <View style={styles.toolbar}>
          {TOOLBAR_ITEMS.map((item) => (
            <TouchableOpacity
              key={`${item.cmd}-${item.label}`}
              onPress={() => execCommand(item.cmd, item.value)}
              style={styles.toolbarBtn}
              activeOpacity={0.65}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <Text
                style={[
                  styles.toolbarBtnText,
                  item.cmd === 'bold'      && styles.textBold,
                  item.cmd === 'italic'    && styles.textItalic,
                  item.cmd === 'underline' && styles.textUnderline,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* WebView — contentEditable HTML document */}
        <WebView
          ref={webViewRef}
          source={{ html: buildEditorHtml(placeholder) }}
          style={{ height, backgroundColor: colors.void }}
          onMessage={handleMessage}
          scrollEnabled
          showsVerticalScrollIndicator={false}
          keyboardDisplayRequiresUserAction={false}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          nestedScrollEnabled
        />
      </View>
    )
  },
)

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginTop: spacing.md,
    backgroundColor: colors.void,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    padding: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  toolbarBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 34,
    height: 34,
  },
  toolbarBtnText: {
    color: colors.paper,
    fontSize: 13,
    fontFamily: typography.fontFamily.regular,
  },
  textBold:      { fontFamily: typography.fontFamily.bold },
  textItalic:    { fontStyle: 'italic' },
  textUnderline: { textDecorationLine: 'underline' },
  fallbackNote: {
    color: colors.muted,
    fontSize: 11,
    fontFamily: typography.fontFamily.regular,
    flex: 1,
  },
  fallbackInput: {
    color: colors.paper,
    fontSize: 16,
    fontFamily: typography.fontFamily.regular,
    lineHeight: 24,
    padding: spacing.md,
  },
})

export default RichTextEditor

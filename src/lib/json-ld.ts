/**
 * Serialize structured data for an inline
 * `<script type="application/ld+json">` block.
 *
 * Plain `JSON.stringify` is not safe inside a script element: a value that
 * contains `</script>` (e.g. an admin-edited blog title) would close the
 * element early and let the rest run as HTML. Escaping `<`, `>` and `&` as
 * JSON unicode escapes keeps the payload equivalent JSON while making it
 * impossible to break out of the script element. U+2028/U+2029 are escaped
 * too so the output is also a valid JS string literal.
 */
export function jsonLdScript(data: unknown): string {
  return (JSON.stringify(data) ?? "null")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

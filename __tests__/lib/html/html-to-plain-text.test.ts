import { htmlToPlainText } from '@/lib/html/html-to-plain-text'

describe('LUM-1336 htmlToPlainText', () => {
  it('keeps paragraph and list structure as lines', () => {
    expect(
      htmlToPlainText(
        '<p>Pad cells.</p><p>Then <b>ship</b>.</p><ul><li>one</li><li>two</li></ul>'
      )
    ).toBe('Pad cells.\nThen ship.\n- one\n- two')
  })

  it('turns <br> into a newline', () => {
    expect(htmlToPlainText('a<br>b<br/>c')).toBe('a\nb\nc')
  })

  it('drops script and style source and comments', () => {
    expect(
      htmlToPlainText(
        '<p>keep</p><script>alert(1)</script><style>p{}</style><!-- x -->'
      )
    ).toBe('keep')
  })

  it('decodes named and numeric entities after stripping tags', () => {
    expect(htmlToPlainText('<p>a &amp; b &#39;c&#x27; &lt;b&gt;</p>')).toBe(
      "a & b 'c' <b>"
    )
  })

  it('leaves unknown or out-of-range entities alone', () => {
    expect(htmlToPlainText('&bogus; &#xFFFFFFF; &#0;')).toBe(
      '&bogus; &#xFFFFFFF; &#0;'
    )
  })

  it('passes plain text through unchanged', () => {
    expect(htmlToPlainText('One\nTwo')).toBe('One\nTwo')
  })
})

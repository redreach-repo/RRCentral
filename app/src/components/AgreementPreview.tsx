import type { AgreementBlock } from '../lib/serviceAgreement'

/** Shows the filled agreement the way the PDF lays it out. */
export default function AgreementPreview({ blocks }: { blocks: AgreementBlock[] }) {
  return (
    <div style={{ background: '#fff', color: '#141414', borderRadius: 8, padding: '20px 22px', fontSize: 13, lineHeight: 1.5 }}>
      {blocks.map((b, i) =>
        b.kind === 'title' ? (
          <h3 key={i} style={{ fontSize: 20, margin: '0 0 10px' }}>
            {b.text}
          </h3>
        ) : b.kind === 'heading' ? (
          <h4 key={i} style={{ fontSize: 14, margin: '14px 0 4px' }}>
            {b.text}
          </h4>
        ) : b.kind === 'bullet' ? (
          <div key={i} style={{ paddingLeft: 18, textIndent: -12, margin: '2px 0' }}>
            • {b.text}
          </div>
        ) : b.kind === 'paragraph' ? (
          <p key={i} style={{ margin: '0 0 6px' }}>
            {b.text}
          </p>
        ) : (
          <p key={i} style={{ margin: '16px 0 0', color: '#666' }}>
            [Signature blocks for both parties: name, title, signature and date]
          </p>
        ),
      )}
    </div>
  )
}

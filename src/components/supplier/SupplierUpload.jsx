import { useState, useRef } from 'react';
import { useSupplierData } from '../../hooks/useSupplierData';
import { extractPdfLines } from '../../utils/pdfExtract';
import { detectPdfType, parseByType, classifyMixedOrders } from '../../utils/supplierParsers';

const FILE_TYPES = [
  { id: 'OV', label: 'OV — Ordini Vendita', file: 'SOG_OrdScadG22' },
  { id: 'OL', label: 'OL — Ordini Lavorazione', file: 'SOG_OrdScadG04' },
  { id: 'MIXED', label: 'OA + OP + Acciaieria', file: 'sog_ordscadg00' },
];

export default function SupplierUpload() {
  const { importData, importing } = useSupplierData();
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(null); // currently processing type
  const fileInputRef = useRef(null);

  const handleFiles = async (files) => {
    setError(null);
    const newResults = [];

    for (const file of files) {
      try {
        setProcessing(file.name);

        // Extract text
        const lines = await extractPdfLines(file);
        if (!lines.length) {
          newResults.push({ file: file.name, error: 'Nessun testo estratto dal PDF' });
          continue;
        }

        // Detect type (filename + content)
        let type = detectPdfType(lines, file.name);

        if (!type) {
          newResults.push({ file: file.name, error: 'Tipo PDF non riconosciuto. Usa uno dei file standard di Embyon.' });
          continue;
        }

        console.log(`[SupplierUpload] file="${file.name}" detected type="${type}", first 20 lines:`, lines.slice(0, 20));

        // Parse
        const parsed = parseByType(lines, type);
        console.log(`[SupplierUpload] parsed ${parsed.length} orders, first orderRef:`, parsed[0]?.orderRef);

        if (type === 'MIXED') {
          // Classify each order and import by type
          const grouped = classifyMixedOrders(parsed);
          const breakdown = [];
          let totalOrders = 0, totalMaterials = 0, totalRefs = 0;

          for (const subType of ['OA', 'OP', 'ACCIAIERIA']) {
            const subOrders = grouped[subType];
            if (!subOrders.length) continue;
            const result = await importData(subType, subOrders);
            totalOrders += result.totalOrders;
            totalMaterials += result.totalMaterials;
            totalRefs += result.totalRefs;
            breakdown.push({ type: subType, orders: result.totalOrders });
          }

          newResults.push({
            file: file.name,
            type: 'MIXED',
            orders: totalOrders,
            materials: totalMaterials,
            refs: totalRefs,
            breakdown,
          });
        } else {
          // Single-type file
          const result = await importData(type, parsed);
          newResults.push({
            file: file.name,
            type,
            orders: result.totalOrders,
            materials: result.totalMaterials,
            refs: result.totalRefs,
          });
        }
      } catch (err) {
        console.error('[SupplierUpload]', err);
        newResults.push({ file: file.name, error: err.message });
      }
    }

    setProcessing(null);
    setResults(newResults);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = [...e.dataTransfer.files].filter(f => f.type === 'application/pdf');
    if (files.length) handleFiles(files);
  };

  const handleInputChange = (e) => {
    const files = [...e.target.files];
    if (files.length) handleFiles(files);
    e.target.value = '';
  };

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-tertiary)', marginBottom: 14 }}>
        Carica PDF ordini da Embyon
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: '2px dashed var(--border-mid)',
          borderRadius: 'var(--radius-lg)',
          padding: '40px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          background: 'var(--bg-subtle)',
          transition: 'border-color 0.15s',
          marginBottom: 16,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />
        {processing ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Elaborazione <strong>{processing}</strong>...
          </div>
        ) : importing ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Salvataggio in corso...</div>
        ) : (
          <>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>
              Trascina i PDF qui oppure clicca per selezionare
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              Supportati: OV, OA, OP, OL, Acciaieria
            </div>
          </>
        )}
      </div>

      {/* File reference */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {FILE_TYPES.map(t => (
          <span key={t.id} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>
            {t.label}: {t.file}
          </span>
        ))}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {results.map((r, i) => (
            <div key={i} style={{
              padding: '10px 14px', borderRadius: 'var(--radius-md)',
              border: `1px solid ${r.error ? 'var(--red-border)' : 'var(--green-border)'}`,
              background: r.error ? 'var(--red-bg)' : 'var(--green-bg)',
              fontSize: 13,
            }}>
              <strong>{r.file}</strong>
              {r.error ? (
                <span style={{ color: 'var(--red)', marginLeft: 8 }}>{r.error}</span>
              ) : r.breakdown ? (
                <span style={{ color: 'var(--green)', marginLeft: 8 }}>
                  {r.breakdown.map(b => `${b.type} — ${b.orders}`).join(', ')} ordini
                  <span style={{ color: 'var(--text-tertiary)', marginLeft: 6, fontSize: 12 }}>
                    ({r.materials} materiali, {r.refs} rif.)
                  </span>
                </span>
              ) : (
                <span style={{ color: 'var(--green)', marginLeft: 8 }}>
                  {r.type} — {r.orders} ordini, {r.materials} materiali, {r.refs} riferimenti
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12, color: 'var(--red)', fontSize: 13 }}>{error}</div>
      )}
    </div>
  );
}

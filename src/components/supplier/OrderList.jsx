import { useState, useMemo } from 'react';
import { useSupplierData } from '../../hooks/useSupplierData';

export default function OrderList({ orderType }) {
  const { orders, materials, refs, notes, upsertNote, deleteNote, updateDeadline } = useSupplierData();
  const [search, setSearch] = useState('');
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [editingNote, setEditingNote] = useState(null);  // { orderRef, codiceProdotto, text, id }
  const [editingDate, setEditingDate] = useState(null);   // { materialId, date }

  const typeOrders = orders[orderType] || [];

  const filtered = useMemo(() => {
    if (!search.trim()) return typeOrders;
    const q = search.toLowerCase();
    return typeOrders.filter(o => {
      if (o.order_ref.toLowerCase().includes(q)) return true;
      if (o.client_name?.toLowerCase().includes(q)) return true;
      if (o.supplier_name?.toLowerCase().includes(q)) return true;
      // Search in materials
      const mats = materials[o.id] || [];
      return mats.some(m =>
        m.codice_prodotto?.toLowerCase().includes(q) ||
        m.descrizione?.toLowerCase().includes(q)
      );
    });
  }, [typeOrders, materials, search]);

  const getNotesForOrder = (orderRef) =>
    notes.filter(n => n.order_type === orderType && n.order_ref === orderRef);

  const handleSaveNote = async () => {
    if (!editingNote?.text.trim()) return;
    await upsertNote({
      id: editingNote.id || null,
      orderRef: editingNote.orderRef,
      orderType,
      codiceProdotto: editingNote.codiceProdotto || null,
      noteText: editingNote.text,
    });
    setEditingNote(null);
  };

  const handleSaveDate = async () => {
    if (!editingDate) return;
    await updateDeadline(editingDate.materialId, editingDate.date || null);
    setEditingDate(null);
  };

  return (
    <div>
      {/* Search */}
      <div style={{ marginBottom: 14 }}>
        <input
          type="text" value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca ordine, fornitore, prodotto..."
          style={{ width: '100%', maxWidth: 400, fontSize: 13, padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-primary)', outline: 'none' }}
        />
      </div>

      {/* Count */}
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12 }}>
        {filtered.length} ordini {search && `(filtrati da ${typeOrders.length})`}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          {typeOrders.length === 0 ? 'Nessun ordine caricato. Vai su Upload per importare i PDF.' : 'Nessun risultato.'}
        </div>
      )}

      {/* Order list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(order => {
          const isExpanded = expandedOrder === order.id;
          const mats = materials[order.id] || [];
          const orderNotes = getNotesForOrder(order.order_ref);
          const orderLevelNotes = orderNotes.filter(n => !n.codice_prodotto);

          return (
            <div key={order.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              {/* Order header */}
              <button
                onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', border: 'none', background: isExpanded ? 'var(--bg-subtle)' : 'var(--bg-card)',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', minWidth: 160 }}>
                  {order.order_ref}
                </span>
                {order.order_date && (
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {new Date(order.order_date).toLocaleDateString('it-IT')}
                  </span>
                )}
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>
                  {order.client_name || order.supplier_name || ''}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: '2px 8px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  {mats.length} mat.
                </span>
                {orderLevelNotes.length > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--amber)', padding: '2px 6px', background: 'var(--amber-bg)', borderRadius: 3, border: '1px solid var(--amber-border)' }}>
                    {orderLevelNotes.length} note
                  </span>
                )}
                <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>{isExpanded ? '▾' : '▸'}</span>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px' }}>
                  {/* Order-level info */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                    {order.supplier_code && <span>Cod. {order.supplier_code}</span>}
                    {order.supplier_phone && <span>Tel. {order.supplier_phone}</span>}
                    {order.client_code && <span>Cod. cliente {order.client_code}</span>}
                    {order.valore_residuo != null && <span>Val. residuo: <b style={{ fontFamily: 'var(--font-serif)' }}>{fmtNum(order.valore_residuo)}</b></span>}
                    {order.peso_totale != null && <span>Peso tot.: <b style={{ fontFamily: 'var(--font-serif)' }}>{fmtNum(order.peso_totale)}</b></span>}
                    {order.tot_peso_res != null && <span>Peso res.: <b style={{ fontFamily: 'var(--font-serif)' }}>{fmtNum(order.tot_peso_res)}</b></span>}
                  </div>

                  {/* Order-level notes */}
                  <NotesSection
                    notes={orderLevelNotes}
                    onAdd={() => setEditingNote({ orderRef: order.order_ref, codiceProdotto: null, text: '', id: null })}
                    onEdit={(n) => setEditingNote({ orderRef: order.order_ref, codiceProdotto: null, text: n.note_text, id: n.id })}
                    onDelete={deleteNote}
                  />

                  {/* Materials table */}
                  {mats.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                            {orderType === 'OL' && <th style={thStyle}>Pos</th>}
                            <th style={thStyle}>Scadenza</th>
                            <th style={thStyle}>Scad. Effettiva</th>
                            <th style={thStyle}>Codice</th>
                            <th style={thStyle}>Descrizione</th>
                            {orderType === 'OV' && <><th style={thStyle}>Peso</th></>}
                            {(orderType === 'OA' || orderType === 'OP' || orderType === 'ACCIAIERIA') && (
                              <><th style={thStyle}>Ordinato</th><th style={thStyle}>Ricevuto</th><th style={thStyle}>Val. Res.</th></>
                            )}
                            {orderType === 'OL' && <><th style={thStyle}>Qty</th><th style={thStyle}>Kg</th><th style={thStyle}>Status</th></>}
                            <th style={thStyle}>Rif.</th>
                            <th style={thStyle}>Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mats.map(mat => {
                            const matRefs = refs[mat.id] || [];
                            const matNotes = orderNotes.filter(n => n.codice_prodotto === mat.codice_prodotto);
                            const isEditingThisDate = editingDate?.materialId === mat.id;
                            const effectiveDate = mat.scadenza_effettiva || mat.scadenza;
                            const daysUntil = effectiveDate ? Math.ceil((new Date(effectiveDate) - new Date()) / 86400000) : null;

                            return (
                              <tr key={mat.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                {orderType === 'OL' && <td style={tdStyle}>{mat.pos || '—'}</td>}
                                <td style={{ ...tdStyle, fontFamily: 'var(--font-serif)' }}>
                                  {mat.scadenza ? new Date(mat.scadenza).toLocaleDateString('it-IT') : '—'}
                                </td>
                                <td style={tdStyle}>
                                  {isEditingThisDate ? (
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <input
                                        type="date"
                                        value={editingDate.date || ''}
                                        onChange={e => setEditingDate({ ...editingDate, date: e.target.value })}
                                        style={{ fontSize: 12, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 4 }}
                                      />
                                      <button onClick={handleSaveDate} style={smallBtn}>OK</button>
                                      <button onClick={() => setEditingDate(null)} style={{ ...smallBtn, color: 'var(--text-tertiary)' }}>X</button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setEditingDate({ materialId: mat.id, date: mat.scadenza_effettiva || '' })}
                                      style={{
                                        background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                                        fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 12,
                                        color: daysUntil !== null && daysUntil <= 7 ? 'var(--red)' : daysUntil !== null && daysUntil <= 14 ? 'var(--amber)' : 'var(--text-primary)',
                                        borderBottom: '1px dashed var(--border-mid)',
                                      }}
                                    >
                                      {mat.scadenza_effettiva ? new Date(mat.scadenza_effettiva).toLocaleDateString('it-IT') : '+ data'}
                                    </button>
                                  )}
                                </td>
                                <td style={{ ...tdStyle, fontFamily: 'var(--font-serif)', fontWeight: 600 }}>{mat.codice_prodotto || '—'}</td>
                                <td style={tdStyle}>{mat.descrizione || '—'}</td>
                                {orderType === 'OV' && <td style={{ ...tdStyle, fontFamily: 'var(--font-serif)' }}>{fmtNum(mat.peso)}</td>}
                                {(orderType === 'OA' || orderType === 'OP' || orderType === 'ACCIAIERIA') && (
                                  <>
                                    <td style={{ ...tdStyle, fontFamily: 'var(--font-serif)' }}>{fmtNum(mat.ordinato)}</td>
                                    <td style={{ ...tdStyle, fontFamily: 'var(--font-serif)' }}>{fmtNum(mat.ricevuto)}</td>
                                    <td style={{ ...tdStyle, fontFamily: 'var(--font-serif)' }}>{fmtNum(mat.valore_residuo)}</td>
                                  </>
                                )}
                                {orderType === 'OL' && (
                                  <>
                                    <td style={{ ...tdStyle, fontFamily: 'var(--font-serif)' }}>{fmtNum(mat.qty_inviata)}</td>
                                    <td style={{ ...tdStyle, fontFamily: 'var(--font-serif)' }}>{fmtNum(mat.kg)}</td>
                                    <td style={{ ...tdStyle, fontSize: 11 }}>{mat.status || '—'}</td>
                                  </>
                                )}
                                <td style={tdStyle}>
                                  {matRefs.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                      {matRefs.map((r, i) => (
                                        <span key={i} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                          {r.ref_type} {r.ref_order || r.ref_code} {r.ref_name ? `— ${r.ref_name}` : ''}
                                        </span>
                                      ))}
                                    </div>
                                  ) : '—'}
                                </td>
                                <td style={tdStyle}>
                                  {matNotes.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                      {matNotes.map(n => (
                                        <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                          <span style={{ fontSize: 11, color: 'var(--amber)' }}>{n.note_text}</span>
                                          <button onClick={() => setEditingNote({ orderRef: order.order_ref, codiceProdotto: mat.codice_prodotto, text: n.note_text, id: n.id })} style={{ ...smallBtn, fontSize: 10 }}>mod</button>
                                          <button onClick={() => deleteNote(n.id)} style={{ ...smallBtn, fontSize: 10, color: 'var(--red)' }}>x</button>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setEditingNote({ orderRef: order.order_ref, codiceProdotto: mat.codice_prodotto, text: '', id: null })}
                                      style={{ ...smallBtn, fontSize: 10, color: 'var(--text-tertiary)' }}
                                    >+ nota</button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Note editing modal */}
      {editingNote && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setEditingNote(null)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: '24px', maxWidth: 420, width: '90%', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              {editingNote.id ? 'Modifica nota' : 'Nuova nota'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
              {editingNote.orderRef} {editingNote.codiceProdotto ? `— ${editingNote.codiceProdotto}` : '(ordine intero)'}
            </div>
            <textarea
              autoFocus
              value={editingNote.text}
              onChange={e => setEditingNote({ ...editingNote, text: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleSaveNote(); }}
              rows={3}
              style={{ width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => setEditingNote(null)} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>Annulla</button>
              <button onClick={handleSaveNote} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NotesSection({ notes, onAdd, onEdit, onDelete }) {
  if (!notes.length) {
    return (
      <button onClick={onAdd} style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 8, padding: 0 }}>
        + Aggiungi nota ordine
      </button>
    );
  }
  return (
    <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {notes.map(n => (
        <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
          <span style={{ flex: 1, color: 'var(--text-primary)' }}>{n.note_text}</span>
          <button onClick={() => onEdit(n)} style={{ ...smallBtn, fontSize: 10 }}>mod</button>
          <button onClick={() => onDelete(n.id)} style={{ ...smallBtn, fontSize: 10, color: 'var(--red)' }}>x</button>
        </div>
      ))}
      <button onClick={onAdd} style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, alignSelf: 'flex-start' }}>
        + Altra nota
      </button>
    </div>
  );
}

function fmtNum(v) {
  if (v == null) return '—';
  return v.toLocaleString('it-IT', { maximumFractionDigits: 2 });
}

const thStyle = { textAlign: 'left', padding: '6px 8px', fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' };
const tdStyle = { padding: '6px 8px', color: 'var(--text-primary)', verticalAlign: 'top' };
const smallBtn = { background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontSize: 11, color: 'var(--text-secondary)' };

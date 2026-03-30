import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  loadSupplierOrders,
  loadOrderMaterials,
  loadOrderNotes,
  loadRefsForOrder,
  countDeadlines,
  loadDeadlineRows,
  saveOrderNote,
  deleteOrderNote as deleteNoteDb,
  updateScadenzaEffettiva as updateDeadlineDb,
  importParsedOrders,
} from '../utils/supplierDb';

const SupplierCtx = createContext(null);

export function SupplierDataProvider({ children }) {
  const [orders, setOrders] = useState({});          // { OV: [...], OA: [...], ... }
  const [materials, setMaterials] = useState({});      // { orderId: [...] }
  const [refs, setRefs] = useState({});                // { materialId: [...] }
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  // Initial load — orders + materials per type, refs loaded on-demand
  useEffect(() => {
    (async () => {
      try {
        console.log('[SupplierData] starting initial load...');
        const types = ['OV', 'OA', 'OP', 'OL', 'ACCIAIERIA'];
        const allOrders = {};
        const allMats = {};

        for (const t of types) {
          try {
            const ords = await loadSupplierOrders(t);
            allOrders[t] = ords;

            if (ords.length) {
              const mats = await loadOrderMaterials(ords.map(o => o.id));
              for (const m of mats) {
                if (!allMats[m.order_id]) allMats[m.order_id] = [];
                allMats[m.order_id].push(m);
              }
            }
          } catch (err) {
            console.error(`[SupplierData] error loading type ${t}:`, err);
            allOrders[t] = [];
          }
        }

        let allNotes = [];
        try {
          allNotes = await loadOrderNotes();
        } catch (err) {
          console.error('[SupplierData] error loading notes:', err);
        }

        console.log('[SupplierData] load complete:', Object.entries(allOrders).map(([k, v]) => `${k}=${v.length}`).join(', '));

        setOrders(allOrders);
        setMaterials(allMats);
        setNotes(allNotes);
      } catch (err) {
        console.error('[SupplierData] load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Fetch refs on-demand for a single order (called when user expands an order)
  const fetchRefs = useCallback(async (orderId) => {
    // Skip if already loaded
    if (refs[`_loaded_${orderId}`]) return;
    try {
      const grouped = await loadRefsForOrder(orderId);
      setRefs(prev => ({ ...prev, ...grouped, [`_loaded_${orderId}`]: true }));
    } catch (err) {
      console.error(`[SupplierData] error loading refs for order ${orderId}:`, err);
    }
  }, [refs]);

  // Import parsed PDF data
  const importData = useCallback(async (orderType, parsedOrders) => {
    setImporting(true);
    try {
      console.log(`[importData] importing ${parsedOrders.length} orders as type="${orderType}"`);
      const result = await importParsedOrders(orderType, parsedOrders);
      console.log(`[importData] import done:`, result);

      // Reload affected type
      const ords = await loadSupplierOrders(orderType);
      console.log(`[importData] reload ${orderType}: ${ords.length} orders`);
      setOrders(prev => ({ ...prev, [orderType]: ords }));

      // Reload materials for this type
      if (ords.length) {
        const mats = await loadOrderMaterials(ords.map(o => o.id));
        const newMats = {};
        for (const m of mats) {
          if (!newMats[m.order_id]) newMats[m.order_id] = [];
          newMats[m.order_id].push(m);
        }
        setMaterials(prev => {
          const updated = { ...prev };
          for (const o of ords) delete updated[o.id];
          return { ...updated, ...newMats };
        });
      }

      // Clear cached refs for this type so they reload on expand
      setRefs(prev => {
        const updated = { ...prev };
        const orderIds = ords.map(o => o.id);
        for (const key of Object.keys(updated)) {
          if (key.startsWith('_loaded_') && orderIds.includes(key.slice(8))) {
            delete updated[key];
          }
        }
        return updated;
      });

      return result;
    } finally {
      setImporting(false);
    }
  }, []);

  // Save a note
  const upsertNote = useCallback(async (noteData) => {
    await saveOrderNote(noteData);
    const allNotes = await loadOrderNotes();
    setNotes(allNotes);
  }, []);

  // Delete a note
  const deleteNote = useCallback(async (id) => {
    await deleteNoteDb(id);
    setNotes(prev => prev.filter(n => n.id !== id));
  }, []);

  // Update deadline
  const updateDeadline = useCallback(async (materialId, date) => {
    await updateDeadlineDb(materialId, date);
    setMaterials(prev => {
      const updated = { ...prev };
      for (const [orderId, mats] of Object.entries(updated)) {
        updated[orderId] = mats.map(m =>
          m.id === materialId ? { ...m, scadenza_effettiva: date } : m
        );
      }
      return updated;
    });
  }, []);

  const value = {
    orders, materials, refs, notes,
    loading, importing,
    countDeadlines, loadDeadlineRows,
    importData, fetchRefs, upsertNote, deleteNote, updateDeadline,
  };

  return <SupplierCtx.Provider value={value}>{children}</SupplierCtx.Provider>;
}

export function useSupplierData() {
  const ctx = useContext(SupplierCtx);
  if (!ctx) throw new Error('useSupplierData must be used within SupplierDataProvider');
  return ctx;
}

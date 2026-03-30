import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  loadSupplierOrders,
  loadOrderMaterials,
  loadOrderNotes,
  loadMaterialRefs,
  loadUpcomingDeadlines,
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
  const [deadlines, setDeadlines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  // Initial load
  useEffect(() => {
    (async () => {
      try {
        const types = ['OV', 'OA', 'OP', 'OL', 'ACCIAIERIA'];
        const allOrders = {};
        const allMats = {};
        const allRefs = {};

        for (const t of types) {
          const ords = await loadSupplierOrders(t);
          allOrders[t] = ords;

          if (ords.length) {
            const mats = await loadOrderMaterials(ords.map(o => o.id));
            for (const m of mats) {
              if (!allMats[m.order_id]) allMats[m.order_id] = [];
              allMats[m.order_id].push(m);
            }

            const matIds = mats.map(m => m.id);
            if (matIds.length) {
              const r = await loadMaterialRefs(matIds);
              for (const ref of r) {
                if (!allRefs[ref.material_id]) allRefs[ref.material_id] = [];
                allRefs[ref.material_id].push(ref);
              }
            }
          }
        }

        const allNotes = await loadOrderNotes();
        const dl = await loadUpcomingDeadlines(30);

        setOrders(allOrders);
        setMaterials(allMats);
        setRefs(allRefs);
        setNotes(allNotes);
        setDeadlines(dl);
      } catch (err) {
        console.error('[SupplierData] load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Import parsed PDF data
  const importData = useCallback(async (orderType, parsedOrders) => {
    setImporting(true);
    try {
      const result = await importParsedOrders(orderType, parsedOrders);

      // Reload affected type
      const ords = await loadSupplierOrders(orderType);
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
          // Remove old entries for this type's orders
          for (const o of ords) delete updated[o.id];
          return { ...updated, ...newMats };
        });

        // Reload refs
        const matIds = mats.map(m => m.id);
        if (matIds.length) {
          const r = await loadMaterialRefs(matIds);
          const newRefs = {};
          for (const ref of r) {
            if (!newRefs[ref.material_id]) newRefs[ref.material_id] = [];
            newRefs[ref.material_id].push(ref);
          }
          setRefs(prev => {
            const updated = { ...prev };
            for (const mid of matIds) delete updated[mid];
            return { ...updated, ...newRefs };
          });
        }
      }

      // Reload deadlines
      const dl = await loadUpcomingDeadlines(30);
      setDeadlines(dl);

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
    // Refresh deadlines
    const dl = await loadUpcomingDeadlines(30);
    setDeadlines(dl);
  }, []);

  const value = {
    orders, materials, refs, notes, deadlines,
    loading, importing,
    importData, upsertNote, deleteNote, updateDeadline,
  };

  return <SupplierCtx.Provider value={value}>{children}</SupplierCtx.Provider>;
}

export function useSupplierData() {
  const ctx = useContext(SupplierCtx);
  if (!ctx) throw new Error('useSupplierData must be used within SupplierDataProvider');
  return ctx;
}

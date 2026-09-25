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
  loadLastUpdate,
} from '../utils/supplierDb';

const ORDER_TYPES = ['OV', 'OA', 'OP', 'OL', 'ACCIAIERIA'];

const SupplierCtx = createContext(null);

export function SupplierDataProvider({ children }) {
  const [orders, setOrders] = useState({});          // { OV: [...], OA: [...], ... }
  const [materials, setMaterials] = useState({});      // { orderId: [...] }
  const [refs, setRefs] = useState({});                // { materialId: [...] }
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Full load from scratch — orders + materials per type, refs loaded on-demand.
  // Used for the initial load and after every import (no reuse of in-memory state).
  // `loading` is only true during the first load, so a reload doesn't unmount the UI.
  const reloadAll = useCallback(async () => {
    try {
      console.log('[SupplierData] starting full load...');
      const allOrders = {};
      const allMats = {};

      for (const t of ORDER_TYPES) {
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

      let last = null;
      try {
        last = await loadLastUpdate();
      } catch (err) {
        console.error('[SupplierData] error loading last update:', err);
      }

      console.log('[SupplierData] load complete:', Object.entries(allOrders).map(([k, v]) => `${k}=${v.length}`).join(', '));

      setOrders(allOrders);
      setMaterials(allMats);
      setRefs({});
      setNotes(allNotes);
      setLastUpdate(last);
    } catch (err) {
      console.error('[SupplierData] load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reloadAll(); }, [reloadAll]);

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
    loading, lastUpdate,
    countDeadlines, loadDeadlineRows,
    reloadAll, fetchRefs, upsertNote, deleteNote, updateDeadline,
  };

  return <SupplierCtx.Provider value={value}>{children}</SupplierCtx.Provider>;
}

export function useSupplierData() {
  const ctx = useContext(SupplierCtx);
  if (!ctx) throw new Error('useSupplierData must be used within SupplierDataProvider');
  return ctx;
}

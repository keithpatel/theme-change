import { useState, useEffect, FormEvent } from 'react';
// @ts-ignore
import { collection, addDoc, getDocs, query, orderBy, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Member } from '../types';
import { Search, DollarSign, Calendar, User, RotateCcw, Edit2, Trash2, X, Save, AlertTriangle } from 'lucide-react';

interface RefundRecord {
  id: string;
  memberId: string;
  memberName: string;
  totalPayout: number; 
  date: string;
  note?: string;
  totalSavings?: number;
  interestAmount?: number;
}

const Refunds = () => {
  const [members, setMembers] = useState<Member[]>([]);
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]); 
  const [note, setNote] = useState('');

  // Delete Modal State
  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean, id: string | null, text: string}>({
    isOpen: false,
    id: null,
    text: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const memSnapshot = await getDocs(collection(db, 'members'));
      const membersList = memSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Member[];
      membersList.sort((a, b) => a.name.localeCompare(b.name));
      setMembers(membersList);

      const refQuery = query(collection(db, 'withdrawals'), orderBy('date', 'desc'));
      const refSnapshot = await getDocs(refQuery);
      const refundsList = refSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as RefundRecord[];
      setRefunds(refundsList);
      
      setLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setLoading(false);
    }
  };

  const resetForm = () => {
    setAmount('');
    setNote('');
    setSelectedMemberId('');
    setDate(new Date().toISOString().split('T')[0]);
    setEditingId(null);
  };

  const handleEdit = (refund: RefundRecord) => {
    setEditingId(refund.id);
    setSelectedMemberId(refund.memberId);
    setAmount(refund.totalPayout.toString());
    setDate(refund.date);
    setNote(refund.note || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const initiateDelete = (refund: RefundRecord) => {
    setDeleteModal({
      isOpen: true,
      id: refund.id,
      text: `${refund.memberName}'s refund of $${refund.totalPayout}`
    });
  };

  const confirmDelete = async () => {
    if (!deleteModal.id) return;
    try {
      await deleteDoc(doc(db, 'withdrawals', deleteModal.id));
      setRefunds(prev => prev.filter(r => r.id !== deleteModal.id));
      if (editingId === deleteModal.id) resetForm();
      setDeleteModal({ isOpen: false, id: null, text: '' });
    } catch (error) {
      console.error("Error deleting refund:", error);
      alert("Failed to delete refund.");
    }
  };

  const handleRefundSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedMemberId || !amount) return;

    setIsSubmitting(true);
    const member = members.find(m => m.id === selectedMemberId);
    if (!member) {
      setIsSubmitting(false);
      return;
    }

    try {
      const refundAmount = parseFloat(amount);
      const refundData = {
        memberId: member.id,
        memberName: member.name,
        totalPayout: refundAmount,
        totalSavings: refundAmount, 
        interestAmount: 0,
        date: date,
        note: note,
        timestamp: new Date().toISOString()
      };

      if (editingId) {
        await updateDoc(doc(db, 'withdrawals', editingId), refundData);
      } else {
        await addDoc(collection(db, 'withdrawals'), refundData);
      }
      
      resetForm();
      fetchData();
    } catch (error) {
      console.error("Error saving refund:", error);
      alert("Failed to save refund.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Member Refunds</h2>
          <p className="text-gray-500 mt-1">Record and track savings payouts to members.</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-100">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <RotateCcw size={20} className="text-emerald-600" />
          {editingId ? 'Edit Payout Record' : 'Record New Payout'}
        </h3>
        <form onSubmit={handleRefundSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
              <User size={12} /> Member
            </label>
            <select
              required
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-sm"
            >
              <option value="">Select Member...</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name} (#{m.uniqueId})</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
              <DollarSign size={12} /> Amount
            </label>
            <input
              type="number"
              required
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
              <Calendar size={12} /> Date
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {editingId ? <Save size={18} /> : <RotateCcw size={18} />}
              {isSubmitting ? 'Saving...' : editingId ? 'Update' : 'Record'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="bg-gray-100 hover:bg-gray-200 text-gray-600 p-2 rounded-lg"
              >
                <X size={20} />
              </button>
            )}
          </div>

          <div className="lg:col-span-4 space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Note / Reason (Optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Member leaving the circle"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
            />
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
          <h3 className="font-bold text-gray-700 uppercase text-xs tracking-wider">Refund History</h3>
          <span className="text-xs text-gray-500">{refunds.length} Transactions</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white text-gray-400 text-[10px] font-bold uppercase tracking-widest border-b">
              <tr>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Member</th>
                <th className="px-6 py-3">Note</th>
                <th className="px-6 py-3 text-right">Amount</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {refunds.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-400 italic">No refund records found.</td>
                </tr>
              ) : (
                refunds.map(refund => (
                  <tr key={refund.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4 text-sm text-gray-600">{new Date(refund.date).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-gray-900">{refund.memberName}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 italic max-w-xs truncate">{refund.note || '-'}</td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-bold text-red-600">-${refund.totalPayout.toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEdit(refund)} className="p-1.5 text-gray-400 hover:text-emerald-600 transition-colors" title="Edit">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => initiateDelete(refund)} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors" title="Delete">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100] animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="text-red-600" size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Refund Record?</h3>
            <p className="text-gray-500 text-sm mb-6">
              Are you sure you want to delete <span className="font-bold text-gray-800">{deleteModal.text}</span>? This will affect the dashboard totals.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModal({ isOpen: false, id: null, text: '' })}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Refunds;
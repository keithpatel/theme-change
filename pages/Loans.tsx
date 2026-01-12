import { useState, useEffect, FormEvent } from 'react';
// @ts-ignore
import { collection, getDocs, doc, updateDoc, addDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { LoanRequest, UserRole } from '../types';
import { useAuth } from '../App';
import { CheckCircle, XCircle, DollarSign, X } from 'lucide-react';

const Loans = () => {
  const { role } = useAuth();
  const isAdminView = role === UserRole.ADMIN_VIEW;
  const [loans, setLoans] = useState<LoanRequest[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'paid'>('all');

  // Repayment Modal
  const [isRepayModalOpen, setIsRepayModalOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<LoanRequest | null>(null);
  const [repaymentAmount, setRepaymentAmount] = useState('');
  const [repaymentNote, setRepaymentNote] = useState('');

  useEffect(() => {
    fetchLoans();
  }, []);

  const fetchLoans = async () => {
    try {
      const q = query(collection(db, 'loans'), orderBy('requestDate', 'desc'));
      const querySnapshot = await getDocs(q);
      const loansData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LoanRequest[];
      setLoans(loansData);
    } catch (error) {
      console.error("Error fetching loans:", error);
    }
  };

  const notifyMember = async (memberId: string, message: string, type: 'info' | 'success' | 'warning') => {
    await addDoc(collection(db, 'notifications'), {
      recipient: memberId,
      message,
      read: false,
      type,
      timestamp: new Date().toISOString()
    });
  };

  const handleStatusChange = async (loan: LoanRequest, newStatus: 'approved' | 'rejected') => {
    if (!window.confirm(`Are you sure you want to ${newStatus} this loan?`)) return;

    try {
      await updateDoc(doc(db, 'loans', loan.id), { status: newStatus });

      // Notify Member
      await notifyMember(
        loan.memberId,
        `Your loan request for $${loan.amount} has been ${newStatus}.`,
        newStatus === 'approved' ? 'success' : 'warning'
      );

      fetchLoans();
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const openRepayModal = (loan: LoanRequest) => {
    setSelectedLoan(loan);
    setRepaymentAmount('');
    setRepaymentNote('');
    setIsRepayModalOpen(true);
  };

  const handleRepaymentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedLoan) return;

    const amount = parseFloat(repaymentAmount);
    if (isNaN(amount) || amount <= 0) return;

    const currentRepaid = selectedLoan.repaidAmount || 0;
    const newTotalRepaid = currentRepaid + amount;
    const isPaidOff = newTotalRepaid >= selectedLoan.amount;

    // Create new repayment record
    const newRepayment = {
      amount,
      date: new Date().toISOString(),
      note: repaymentNote
    };

    const updatedHistory = [...(selectedLoan.repaymentHistory || []), newRepayment];

    try {
      await updateDoc(doc(db, 'loans', selectedLoan.id), {
        repaidAmount: newTotalRepaid,
        repaymentHistory: updatedHistory,
        status: isPaidOff ? 'paid' : 'approved'
      });

      // Notify Member
      await notifyMember(
        selectedLoan.memberId,
        `Payment of $${amount} received for your loan. Remaining: $${Math.max(0, selectedLoan.amount - newTotalRepaid)}`,
        'info'
      );

      if (isPaidOff) {
        await notifyMember(
          selectedLoan.memberId,
          `Congratulations! Your loan of $${selectedLoan.amount} has been fully repaid.`,
          'success'
        );
      }

      setIsRepayModalOpen(false);
      fetchLoans();
    } catch (error) {
      console.error("Error adding repayment:", error);
    }
  };

  const filteredLoans = loans.filter(loan => {
    if (filter === 'all') return true;
    if (filter === 'active') return loan.status === 'approved' && (loan.repaidAmount || 0) < loan.amount;
    return loan.status === filter;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Loan Management</h2>
        <div className="flex gap-2 bg-white p-1 rounded-lg border">
          {['all', 'pending', 'active', 'paid'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4">
        {filteredLoans.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl text-gray-500">
            No loans found in this category.
          </div>
        ) : (
          filteredLoans.map(loan => {
            const repaid = loan.repaidAmount || 0;
            const percentage = Math.min(100, (repaid / loan.amount) * 100);

            return (
              <div key={loan.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-bold text-gray-900 text-lg">{loan.memberName}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium uppercase
                      ${loan.status === 'approved' ? 'bg-green-100 text-green-700' :
                        loan.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          loan.status === 'paid' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                      }`}>
                      {loan.status}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-2xl font-bold text-gray-900">${loan.amount}</span>
                    <span className="text-gray-500 text-sm">requested on {new Date(loan.requestDate).toLocaleDateString()}</span>
                  </div>
                  <p className="text-gray-600 text-sm italic">"{loan.reason}"</p>

                  {loan.status !== 'pending' && loan.status !== 'rejected' && (
                    <div className="mt-4 max-w-sm">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Paid: ${repaid}</span>
                        <span>Remaining: ${Math.max(0, loan.amount - repaid)}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${percentage}%` }}></div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col justify-center gap-3 min-w-[140px]">
                  {!isAdminView && loan.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleStatusChange(loan, 'approved')}
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors"
                      >
                        <CheckCircle size={18} /> Approve
                      </button>
                      <button
                        onClick={() => handleStatusChange(loan, 'rejected')}
                        className="flex items-center justify-center gap-2 bg-red-100 hover:bg-red-200 text-red-700 py-2 px-4 rounded-lg transition-colors"
                      >
                        <XCircle size={18} /> Reject
                      </button>
                    </>
                  )}
                  {!isAdminView && loan.status === 'approved' && (
                    <button
                      onClick={() => openRepayModal(loan)}
                      className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors"
                    >
                      <DollarSign size={18} /> Record Payment
                    </button>
                  )}
                  {loan.status === 'paid' && (
                    <div className="text-center text-blue-600 font-medium flex items-center justify-center gap-2">
                      <CheckCircle size={18} />
                      Paid Off
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Repayment Modal */}
      {isRepayModalOpen && selectedLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800">Record Repayment</h3>
              <button onClick={() => setIsRepayModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleRepaymentSubmit} className="p-6 space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg mb-4">
                <p className="text-sm text-gray-600">Borrower: <span className="font-semibold">{selectedLoan.memberName}</span></p>
                <p className="text-sm text-gray-600">Total Loan: <span className="font-semibold">${selectedLoan.amount}</span></p>
                <p className="text-sm text-gray-600">Remaining: <span className="font-semibold text-blue-700">${selectedLoan.amount - (selectedLoan.repaidAmount || 0)}</span></p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Repayment Amount ($)</label>
                <input
                  type="number"
                  required
                  min="1"
                  max={selectedLoan.amount - (selectedLoan.repaidAmount || 0)}
                  value={repaymentAmount}
                  onChange={(e) => setRepaymentAmount(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (Optional)</label>
                <input
                  type="text"
                  value={repaymentNote}
                  onChange={(e) => setRepaymentNote(e.target.value)}
                  placeholder="e.g. Cash payment"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsRepayModalOpen(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Loans;
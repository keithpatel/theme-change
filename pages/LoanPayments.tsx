import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
// @ts-ignore
import { collection, getDocs, doc, updateDoc, addDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { LoanRequest } from '../types';
import { CheckCircle, DollarSign, X, ChevronDown, ChevronUp, History, Search, AlertTriangle, Clock } from 'lucide-react';

const LoanPayments = () => {
  const navigate = useNavigate();
  const [loans, setLoans] = useState<LoanRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewFilter, setViewFilter] = useState<'active' | 'paid'>('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);
  
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
      // Fetch active/paid loans.
      const q = query(
        collection(db, 'loans'), 
        where('status', 'in', ['approved', 'paid'])
      );
      const querySnapshot = await getDocs(q);
      const loansData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LoanRequest[];
      
      // Client-side sort
      loansData.sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime());

      setLoans(loansData);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching active loans:", error);
      setLoading(false);
    }
  };

  const checkLoanDelinquency = (loan: LoanRequest) => {
    if (loan.status !== 'approved') return { isOverdue: false, isCritical: false, daysSince: 0 };
    
    const today = new Date();
    const startDate = new Date(loan.requestDate);
    const durationMonths = loan.durationMonths || 12;
    
    // Critical: Past final due date
    const finalDueDate = new Date(loan.requestDate);
    finalDueDate.setMonth(finalDueDate.getMonth() + durationMonths);
    const isCritical = today > finalDueDate;

    // Overdue: No payment in > 32 days
    const lastPaymentDate = loan.repaymentHistory && loan.repaymentHistory.length > 0 
      ? new Date(loan.repaymentHistory[loan.repaymentHistory.length - 1].date)
      : new Date(loan.requestDate);
    
    const diffTime = Math.abs(today.getTime() - lastPaymentDate.getTime());
    const daysSince = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const isOverdue = daysSince > 32;

    return { isOverdue, isCritical, daysSince };
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

  const openRepayModal = (loan: LoanRequest) => {
    setSelectedLoan(loan);
    
    // Smart Autofill: Use monthly payment if available, capped by remaining balance
    const remaining = loan.amount - (loan.repaidAmount || 0);
    if (loan.monthlyPayment && loan.monthlyPayment > 0) {
        const amountToFill = Math.min(loan.monthlyPayment, remaining);
        // Convert to string, rounding to 2 decimals to avoid floating point issues
        setRepaymentAmount(parseFloat(amountToFill.toFixed(2)).toString());
    } else {
        setRepaymentAmount('');
    }

    setRepaymentNote('');
    setIsRepayModalOpen(true);
  };

  const toggleHistory = (loanId: string) => {
    if (expandedLoanId === loanId) {
      setExpandedLoanId(null);
    } else {
      setExpandedLoanId(loanId);
    }
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
    const newStatus = isPaidOff ? 'paid' : 'approved';

    try {
      await updateDoc(doc(db, 'loans', selectedLoan.id), {
        repaidAmount: newTotalRepaid,
        repaymentHistory: updatedHistory,
        status: newStatus
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
      fetchLoans(); // Refresh data
    } catch (error) {
      console.error("Error adding repayment:", error);
    }
  };

  const filteredLoans = loans.filter(loan => {
    // 1. Search Filter
    const term = searchTerm.toLowerCase();
    const matchesSearch = loan.memberName.toLowerCase().includes(term) || loan.id.toLowerCase().includes(term);

    if (!matchesSearch) return false;

    // 2. View Filter
    if (viewFilter === 'active') return loan.status === 'approved' && (loan.repaidAmount || 0) < loan.amount;
    if (viewFilter === 'paid') return loan.status === 'paid' || (loan.repaidAmount || 0) >= loan.amount;
    
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Loan Payments</h2>
        <div className="flex bg-white rounded-lg shadow-sm border p-1 w-full sm:w-auto">
          <button
            onClick={() => setViewFilter('active')}
            className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewFilter === 'active' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Active Loans
          </button>
          <button
            onClick={() => setViewFilter('paid')}
            className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewFilter === 'paid' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Paid History
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Search by member name or ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm transition-all"
        />
      </div>

      <div className="grid gap-4">
        {filteredLoans.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl text-gray-500 border border-gray-100">
             No {viewFilter} loans found matching your search.
          </div>
        ) : (
          filteredLoans.map(loan => {
            const repaid = loan.repaidAmount || 0;
            const percentage = Math.min(100, (repaid / loan.amount) * 100);
            const isExpanded = expandedLoanId === loan.id;
            const { isOverdue, isCritical, daysSince } = checkLoanDelinquency(loan);

            return (
              <div key={loan.id} className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden transition-all ${isCritical ? 'border-red-200 ring-1 ring-red-100 bg-red-50/20' : ''}`}>
                <div className="p-6 flex flex-col lg:flex-row justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <h3 
                        onClick={() => navigate('/members', { state: { searchQuery: loan.memberName } })}
                        className="font-bold text-gray-900 text-lg hover:text-emerald-600 cursor-pointer transition-colors"
                        title="View Member Profile"
                      >
                        {loan.memberName}
                      </h3>
                      
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider
                          ${loan.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-green-100 text-green-700'}`}>
                          {loan.status === 'approved' ? 'Active' : 'Paid'}
                        </span>

                        {isCritical && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-600 text-white animate-pulse flex items-center gap-1">
                            <AlertTriangle size={10} /> Delinquent
                          </span>
                        )}

                        {isOverdue && !isCritical && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-white flex items-center gap-1">
                            <Clock size={10} /> Overdue
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-baseline gap-4 mb-4">
                       <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Loan Amount</p>
                          <p className="text-xl font-bold text-gray-900">${loan.amount}</p>
                       </div>
                       <div className="h-8 w-px bg-gray-200"></div>
                       <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Repaid</p>
                          <p className="text-xl font-bold text-green-600">${repaid}</p>
                       </div>
                       <div className="h-8 w-px bg-gray-200"></div>
                       <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Remaining</p>
                          <p className={`text-xl font-bold ${isCritical ? 'text-red-600' : isOverdue ? 'text-amber-600' : 'text-emerald-600'}`}>${Math.max(0, loan.amount - repaid)}</p>
                       </div>
                    </div>

                    <div className="max-w-md">
                      <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-500 ${loan.status === 'paid' ? 'bg-emerald-500' : isCritical ? 'bg-red-500' : isOverdue ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${percentage}%` }}></div>
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        <p className="text-[10px] text-gray-400">{percentage.toFixed(0)}% Repaid</p>
                        {loan.status === 'approved' && (
                            <p className={`text-[10px] font-medium ${isOverdue ? 'text-amber-600' : 'text-gray-400'}`}>
                                Last payment: {daysSince === 0 ? 'Today' : `${daysSince} days ago`}
                            </p>
                        )}
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => toggleHistory(loan.id)}
                      className="mt-4 text-sm text-emerald-600 hover:text-emerald-800 font-medium flex items-center gap-1 focus:outline-none"
                    >
                      <History size={16} />
                      {isExpanded ? 'Hide Transactions' : 'View Transactions'}
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>

                  <div className="flex flex-col justify-center items-end gap-3 min-w-[140px]">
                    {loan.status === 'approved' && (
                      <button 
                        onClick={() => openRepayModal(loan)}
                        className={`flex items-center justify-center gap-2 py-3 px-6 rounded-lg transition-colors font-medium shadow-sm w-full lg:w-auto text-white ${isCritical ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                      >
                        <DollarSign size={18} /> Record Payment
                      </button>
                    )}
                    {loan.status === 'paid' && (
                      <div className="text-center bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 w-full lg:w-auto border border-emerald-100">
                        <CheckCircle size={18} />
                        Fully Repaid
                      </div>
                    )}
                  </div>
                </div>

                {/* Collapsible History Section */}
                {isExpanded && (
                  <div className="bg-gray-50 border-t border-gray-100 p-4">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 px-2">Payment History</h4>
                    {(!loan.repaymentHistory || loan.repaymentHistory.length === 0) ? (
                      <p className="text-sm text-gray-500 italic px-2">No payments recorded yet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="text-gray-500 border-b border-gray-200">
                            <tr>
                              <th className="px-2 py-2 font-medium">Date</th>
                              <th className="px-2 py-2 font-medium">Amount</th>
                              <th className="px-2 py-2 font-medium">Note</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {loan.repaymentHistory.map((payment, idx) => (
                              <tr key={idx} className="hover:bg-gray-100">
                                <td className="px-2 py-2 text-gray-600">
                                  {new Date(payment.date).toLocaleDateString()}
                                </td>
                                <td className="px-2 py-2 font-medium text-gray-900">
                                  ${payment.amount}
                                </td>
                                <td className="px-2 py-2 text-gray-500 italic">
                                  {payment.note || '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
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
              <div className="bg-emerald-50 p-4 rounded-lg mb-4">
                 <p className="text-sm text-gray-600">Borrower: <span className="font-semibold">{selectedLoan.memberName}</span></p>
                 <p className="text-sm text-gray-600">Total Loan: <span className="font-semibold">${selectedLoan.amount}</span></p>
                 <p className="text-sm text-gray-600">Remaining Balance: <span className="font-semibold text-emerald-700 text-lg">${selectedLoan.amount - (selectedLoan.repaidAmount || 0)}</span></p>
                 {selectedLoan.monthlyPayment && (
                     <p className="text-xs text-gray-500 mt-1">Scheduled Monthly Payment: <span className="font-medium">${selectedLoan.monthlyPayment.toFixed(2)}</span></p>
                 )}
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (Optional)</label>
                <input
                  type="text"
                  value={repaymentNote}
                  onChange={(e) => setRepaymentNote(e.target.value)}
                  placeholder="e.g. Bank Transfer, Cash"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
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
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors shadow-sm"
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

export default LoanPayments;
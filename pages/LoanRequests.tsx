import { useState, useEffect, FormEvent } from 'react';
// @ts-ignore
import { collection, getDocs, doc, updateDoc, addDoc, query, where, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { LoanRequest } from '../types';
import { CheckCircle, XCircle, Clock, Calculator, X, AlertTriangle, Users, Search } from 'lucide-react';

const LoanRequests = () => {
  const [loans, setLoans] = useState<LoanRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Approval Modal State
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<LoanRequest | null>(null);
  const [interestRate, setInterestRate] = useState<string>('0.5'); // Default to example
  const [durationMonths, setDurationMonths] = useState<string>('10'); // Default to example
  
  // Reject Modal State
  const [rejectModal, setRejectModal] = useState<{isOpen: boolean, loan: LoanRequest | null}>({
    isOpen: false,
    loan: null
  });

  // Calculated values
  const [calculatedValues, setCalculatedValues] = useState({
    totalInterest: 0,
    disbursedAmount: 0,
    monthlyPayment: 0
  });

  useEffect(() => {
    fetchPendingLoans();
  }, []);

  useEffect(() => {
    if (selectedLoan && interestRate && durationMonths) {
      const principal = selectedLoan.amount;
      const rate = parseFloat(interestRate);
      const months = parseFloat(durationMonths);
      
      if (!isNaN(rate) && !isNaN(months) && months > 0) {
        // "Take Interest First" Logic:
        // Interest is calculated on Principal using Monthly Rate * Duration
        // Disbursed Amount = Principal - Interest.
        // Member repays the full Principal.
        
        const interest = principal * (rate / 100) * months;
        const disbursed = principal - interest;
        const monthly = principal / months;

        setCalculatedValues({
          totalInterest: interest,
          disbursedAmount: disbursed,
          monthlyPayment: monthly
        });
      }
    }
  }, [interestRate, durationMonths, selectedLoan]);

  const fetchPendingLoans = async () => {
    try {
      const q = query(
        collection(db, 'loans'), 
        where('status', '==', 'pending')
      );
      const querySnapshot = await getDocs(q);
      const loansData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LoanRequest[];
      
      loansData.sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime());
      
      setLoans(loansData);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching pending loans:", error);
      setLoading(false);
    }
  };

  const notifyMember = async (memberId: string, message: string, type: 'info' | 'success' | 'warning') => {
    try {
      await addDoc(collection(db, 'notifications'), {
        recipient: memberId,
        message,
        read: false,
        type,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Failed to send notification:", error);
      // We don't throw here to avoid blocking the main action
    }
  };

  const initiateReject = (loan: LoanRequest) => {
    setRejectModal({
      isOpen: true,
      loan: loan
    });
  };

  const confirmReject = async () => {
    const loan = rejectModal.loan;
    if (!loan) return;

    // 1. Optimistic UI Update: Remove from UI immediately
    const previousLoans = [...loans];
    setLoans(prev => prev.filter(l => l.id !== loan.id));
    
    // Close modal immediately
    setRejectModal({ isOpen: false, loan: null });

    try {
      // 2. Delete from Backend
      await deleteDoc(doc(db, 'loans', loan.id));
      
      // 3. Notify Member
      await notifyMember(
        loan.memberId,
        `Your loan request for $${loan.amount} has been rejected.`,
        'warning'
      );
    } catch (error) {
      console.error("Error deleting loan:", error);
      alert("Failed to delete loan from database. Please check your connection.");
      // Revert UI if backend action failed
      setLoans(previousLoans);
    }
  };

  const openApproveModal = (loan: LoanRequest) => {
    setSelectedLoan(loan);
    setInterestRate('0.5'); 
    setDurationMonths('10');
    setIsApproveModalOpen(true);
  };

  const confirmApproval = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedLoan) return;

    try {
      const rate = parseFloat(interestRate);
      const months = parseFloat(durationMonths);

      await updateDoc(doc(db, 'loans', selectedLoan.id), { 
        status: 'approved',
        interestRate: rate,
        durationMonths: months,
        totalInterest: calculatedValues.totalInterest,
        disbursedAmount: calculatedValues.disbursedAmount,
        monthlyPayment: calculatedValues.monthlyPayment
      });
      
      await notifyMember(
        selectedLoan.memberId,
        `Your loan of $${selectedLoan.amount} is APPROVED. ` +
        `Duration: ${months} months. Monthly Payment: $${calculatedValues.monthlyPayment.toFixed(2)}. ` +
        `Disbursed: $${calculatedValues.disbursedAmount.toFixed(2)} (Interest deducted upfront).`,
        'success'
      );

      setLoans(prev => prev.filter(l => l.id !== selectedLoan.id));
      setIsApproveModalOpen(false);
    } catch (error) {
      console.error("Error approving loan:", error);
    }
  };

  const filteredLoans = loans.filter(loan => 
    loan.memberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    loan.amount.toString().includes(searchTerm) ||
    loan.reason.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Pending Loan Requests</h2>
        <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
          {filteredLoans.length} Pending
        </span>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Search requests by name, amount, or reason..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm transition-all"
        />
      </div>

      <div className="grid gap-4">
        {filteredLoans.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl text-gray-500 border border-gray-100 shadow-sm">
            <div className="flex justify-center mb-4">
               <CheckCircle size={48} className="text-gray-300" />
            </div>
            {searchTerm ? (
                <p className="text-lg font-medium">No matches found</p>
            ) : (
                <>
                    <p className="text-lg font-medium">All caught up!</p>
                    <p className="text-sm">No pending loan requests at the moment.</p>
                </>
            )}
          </div>
        ) : (
          filteredLoans.map(loan => {
            // Check guarantor status
            const allGuarantorsApproved = loan.guarantors?.every(g => g.status === 'accepted') ?? true;
            
            return (
              <div key={loan.id} className="bg-white p-6 rounded-xl shadow-sm border border-l-4 border-l-yellow-400 flex flex-col md:flex-row justify-between gap-6 transition-transform hover:scale-[1.01]">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-bold text-gray-900 text-lg">{loan.memberName}</h3>
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium uppercase bg-yellow-100 text-yellow-700">
                      <Clock size={12} /> Pending
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-3xl font-bold text-gray-900">${loan.amount}</span>
                    <span className="text-gray-500 text-sm">requested on {new Date(loan.requestDate).toLocaleDateString()}</span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg mt-2 mb-3">
                    <p className="text-gray-600 text-sm italic">"{loan.reason}"</p>
                  </div>

                  {/* Guarantors Status Display */}
                  {loan.guarantors && loan.guarantors.length > 0 && (
                    <div className="mt-3">
                       <p className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
                          <Users size={14} /> Guarantors Status
                       </p>
                       <div className="flex flex-wrap gap-3">
                          {loan.guarantors.map((g, idx) => (
                             <div key={idx} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm ${
                                g.status === 'accepted' ? 'bg-green-50 border-green-200 text-green-800' :
                                g.status === 'rejected' ? 'bg-red-50 border-red-200 text-red-800' :
                                'bg-gray-50 border-gray-200 text-gray-600'
                             }`}>
                                <div className={`w-2 h-2 rounded-full ${
                                   g.status === 'accepted' ? 'bg-green-500' :
                                   g.status === 'rejected' ? 'bg-red-500' : 'bg-yellow-400'
                                }`} />
                                <span className="font-medium">{g.memberName}</span>
                                <span className="text-xs opacity-75 capitalize">({g.status})</span>
                             </div>
                          ))}
                       </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col justify-center gap-3 min-w-[160px] border-l pl-0 md:pl-6 border-gray-100">
                  <button 
                    type="button"
                    onClick={() => openApproveModal(loan)}
                    disabled={!allGuarantorsApproved}
                    className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg transition-colors font-medium shadow-sm ${
                       allGuarantorsApproved 
                       ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                       : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                    title={!allGuarantorsApproved ? "Waiting for guarantors to accept" : "Approve Loan"}
                  >
                    <CheckCircle size={18} /> Approve
                  </button>
                  <button 
                    type="button"
                    onClick={() => initiateReject(loan)}
                    className="flex items-center justify-center gap-2 bg-white border border-gray-300 hover:bg-red-50 hover:text-red-700 text-gray-700 py-2.5 px-4 rounded-lg transition-colors font-medium"
                  >
                    <XCircle size={18} /> Reject
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Approval Modal */}
      {isApproveModalOpen && selectedLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Calculator size={20} className="text-emerald-600"/> 
                Configure Loan Terms
              </h3>
              <button onClick={() => setIsApproveModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={confirmApproval} className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                   <p className="text-xs text-gray-500 uppercase">Applicant</p>
                   <p className="font-semibold text-gray-900">{selectedLoan.memberName}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                   <p className="text-xs text-gray-500 uppercase">Requested Amount</p>
                   <p className="font-semibold text-gray-900">${selectedLoan.amount}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Interest Rate (%)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.1"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">Applied per month</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (Months)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="1"
                    value={durationMonths}
                    onChange={(e) => setDurationMonths(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              {/* Calculation Summary */}
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 space-y-3">
                 <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Interest (Deducted)</span>
                    <span className="font-medium text-red-600">-${calculatedValues.totalInterest.toFixed(2)}</span>
                 </div>
                 <div className="flex justify-between items-center border-b border-emerald-200 pb-3">
                    <span className="text-sm font-bold text-gray-700">Disbursed Amount (To Member)</span>
                    <span className="font-bold text-green-700 text-lg">${calculatedValues.disbursedAmount.toFixed(2)}</span>
                 </div>
                 
                 <div className="pt-1">
                    <p className="text-xs text-center text-emerald-800 mb-2 font-medium">Repayment Schedule</p>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Total Repayment</span>
                        <span className="font-medium text-gray-900">${selectedLoan.amount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                        <span className="text-sm text-gray-600">Monthly Payment</span>
                        <span className="font-bold text-emerald-700">${calculatedValues.monthlyPayment.toFixed(2)} / month</span>
                    </div>
                 </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsApproveModalOpen(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-medium shadow-sm"
                >
                  Confirm & Approve
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Confirmation Modal */}
      {rejectModal.isOpen && rejectModal.loan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60] animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="text-red-600" size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Reject Loan Request?</h3>
            <p className="text-gray-500 text-sm mb-6">
              Are you sure you want to reject <span className="font-semibold text-gray-800">{rejectModal.loan.memberName}'s</span> request for <span className="font-semibold text-gray-800">${rejectModal.loan.amount}</span>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setRejectModal({ isOpen: false, loan: null })}
                className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmReject}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium shadow-sm"
              >
                Reject & Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoanRequests;
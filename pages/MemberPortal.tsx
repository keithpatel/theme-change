import { useState, useEffect, useRef, FormEvent } from 'react';
import { useAuth } from '../App';
// @ts-ignore
import { collection, addDoc, query, where, getDocs, onSnapshot, writeBatch, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { LogOut, DollarSign, Calendar, Clock, CheckCircle, XCircle, Bell, ChevronDown, ChevronUp, AlertCircle, Users, ShieldCheck, ShieldAlert, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { LoanRequest, AppNotification, Member } from '../types';

const MemberPortal = () => {
   const { currentMember, logout } = useAuth();
   const [loans, setLoans] = useState<LoanRequest[]>([]);
   const [guaranteeRequests, setGuaranteeRequests] = useState<LoanRequest[]>([]);
   const [allMembers, setAllMembers] = useState<Member[]>([]);

   const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

   // Form State
   const [loanAmount, setLoanAmount] = useState('');
   const [loanReason, setLoanReason] = useState('');
   const [guarantor1Id, setGuarantor1Id] = useState('');
   const [guarantor2Id, setGuarantor2Id] = useState('');
   const [isSubmitting, setIsSubmitting] = useState(false);

   const [activeTab, setActiveTab] = useState<'overview' | 'loans' | 'guarantees'>('overview');
   const [expandedLoan, setExpandedLoan] = useState<string | null>(null);

   // Year Selection State
   const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

   // Notifications state
   const [notifications, setNotifications] = useState<AppNotification[]>([]);
   const [showNotifications, setShowNotifications] = useState(false);
   const notifRef = useRef<HTMLDivElement>(null);

   // Calculate stats
   const getPaymentValue = (val: number | boolean | undefined): number => {
      if (val === true) return 100;
      if (typeof val === 'number') return val;
      return 0;
   };

   // 1. Calculate Lifetime Savings (All Years)
   let lifetimeSavings = 0;
   if (currentMember?.payments) {
      Object.values(currentMember.payments).forEach((yearData: any) => {
         Object.values(yearData).forEach((val: any) => {
            lifetimeSavings += getPaymentValue(val);
         });
      });
   }

   // 2. Calculate Selected Year Stats
   const paymentsSelectedYear = currentMember?.payments?.[selectedYear] || {};
   const lateFeesSelectedYear = currentMember?.lateFees?.[selectedYear] || {};

   const totalSavedSelectedYear = Object.values(paymentsSelectedYear).reduce((sum: number, val) => sum + getPaymentValue(val as number | boolean), 0);
   const totalLateFeesSelectedYear = Object.values(lateFeesSelectedYear).reduce((sum: number, val) => sum + ((val as number) || 0), 0);

   // Consolidate all listeners into one useEffect to ensure proper cleanup
   useEffect(() => {
      if (!currentMember) return;

      // 1. Initial One-time Fetches
      fetchMemberLoans();
      fetchMembersList();

      // 2. Setup Real-time Listeners

      // Notifications Listener
      const notifQuery = query(collection(db, 'notifications'), where('recipient', '==', currentMember.id));
      const unsubNotif = onSnapshot(notifQuery, (snapshot) => {
         const notifs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
         })) as AppNotification[];
         notifs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
         setNotifications(notifs);
      }, (error) => {
         // Silently handle permission errors (common during logout/page switching)
         console.log("Notification listener paused");
      });

      // Guarantee Requests Listener
      const guaranteeQuery = query(collection(db, 'loans'), where('guarantorIds', 'array-contains', currentMember.id));
      const unsubGuarantee = onSnapshot(guaranteeQuery, (snapshot) => {
         const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as LoanRequest[];
         requests.sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime());
         setGuaranteeRequests(requests);
      }, (error) => {
         console.log("Guarantee listener paused");
      });

      // Cleanup function: Unsubscribe from listeners when component unmounts or member changes
      return () => {
         unsubNotif();
         unsubGuarantee();
      };
   }, [currentMember]); // Only re-run if currentMember changes

   // Click outside notification close
   useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
         if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
            setShowNotifications(false);
         }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
   }, []);

   const fetchMembersList = async () => {
      try {
         const snapshot = await getDocs(collection(db, 'members'));
         const members = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Member[];
         setAllMembers(members.filter(m => m.id !== currentMember?.id));
      } catch (error) {
         console.error("Error fetching members", error);
      }
   };

   const fetchMemberLoans = async () => {
      if (!currentMember) return;
      try {
         const q = query(collection(db, 'loans'), where('memberId', '==', currentMember.id));
         const snapshot = await getDocs(q);
         const loansData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as LoanRequest[];
         loansData.sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime());
         setLoans(loansData);
      } catch (error) {
         console.error("Error fetching loans", error);
      }
   };

   const markAllRead = async () => {
      const batch = writeBatch(db);
      notifications.forEach(n => {
         if (!n.read) {
            const ref = doc(db, 'notifications', n.id);
            batch.update(ref, { read: true });
         }
      });
      await batch.commit();
   };

   const handleLoanRequest = async (e: FormEvent) => {
      e.preventDefault();
      if (!currentMember) return;

      if (guarantor1Id === guarantor2Id) {
         alert("Please select two different guarantors.");
         return;
      }

      if (!guarantor1Id || !guarantor2Id) {
         alert("Two guarantors are required.");
         return;
      }

      setIsSubmitting(true);

      try {
         const g1 = allMembers.find(m => m.id === guarantor1Id);
         const g2 = allMembers.find(m => m.id === guarantor2Id);

         if (!g1 || !g2) throw new Error("Invalid guarantor selection");

         const guarantors = [
            { memberId: g1.id, memberName: g1.name, status: 'pending' as const },
            { memberId: g2.id, memberName: g2.name, status: 'pending' as const }
         ];

         await addDoc(collection(db, 'loans'), {
            memberId: currentMember.id,
            memberName: currentMember.name,
            amount: parseFloat(loanAmount),
            reason: loanReason,
            status: 'pending',
            requestDate: new Date().toISOString(),
            repaidAmount: 0,
            repaymentHistory: [],
            guarantors: guarantors,
            guarantorIds: [g1.id, g2.id]
         });

         // Notify Admin
         await addDoc(collection(db, 'notifications'), {
            recipient: 'ADMIN',
            message: `${currentMember.name} requested a loan of $${loanAmount}. Pending guarantor approval.`,
            read: false,
            type: 'info',
            timestamp: new Date().toISOString()
         });

         // Notify Guarantors
         const notifyGuarantor = async (recipientId: string) => {
            await addDoc(collection(db, 'notifications'), {
               recipient: recipientId,
               message: `${currentMember.name} has requested you as a guarantor for a loan of $${loanAmount}.`,
               read: false,
               type: 'info',
               timestamp: new Date().toISOString()
            });
         };

         await notifyGuarantor(g1.id);
         await notifyGuarantor(g2.id);

         setLoanAmount('');
         setLoanReason('');
         setGuarantor1Id('');
         setGuarantor2Id('');
         fetchMemberLoans();
         alert('Loan request submitted successfully! Guarantors have been notified.');
         setActiveTab('loans');
      } catch (error) {
         console.error("Error requesting loan", error);
         alert('Failed to submit loan request');
      } finally {
         setIsSubmitting(false);
      }
   };

   const handleGuaranteeAction = async (loan: LoanRequest, action: 'accepted' | 'rejected') => {
      if (!currentMember || !loan.guarantors) return;

      try {
         const updatedGuarantors = loan.guarantors.map(g => {
            if (g.memberId === currentMember.id) {
               return { ...g, status: action };
            }
            return g;
         });

         await updateDoc(doc(db, 'loans', loan.id), {
            guarantors: updatedGuarantors
         });

         // Notify Applicant
         await addDoc(collection(db, 'notifications'), {
            recipient: loan.memberId,
            message: `${currentMember.name} has ${action} your guarantor request.`,
            read: false,
            type: action === 'accepted' ? 'success' : 'warning',
            timestamp: new Date().toISOString()
         });

      } catch (error) {
         console.error("Error updating guarantee", error);
         alert("Action failed. Please try again.");
      }
   };

   const unreadCount = notifications.filter(n => !n.read).length;
   const pendingGuaranteesCount = guaranteeRequests.filter(l =>
      l.status === 'pending' &&
      l.guarantors?.find(g => g.memberId === currentMember?.id)?.status === 'pending'
   ).length;

   if (!currentMember) return null;

   return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
         {/* Header */}
         <header className="bg-white shadow-sm px-6 py-4 flex justify-between items-center sticky top-0 z-20">
            <div>
               <h1 className="text-xl font-bold text-blue-600">CommunityCircle</h1>
               <p className="text-xs text-gray-500">Member Portal</p>
            </div>

            <div className="flex items-center gap-4">
               {/* Notifications */}
               <div className="relative" ref={notifRef}>
                  <button
                     onClick={() => { setShowNotifications(!showNotifications); if (!showNotifications && unreadCount > 0) markAllRead(); }}
                     className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                  >
                     <Bell size={20} />
                     {unreadCount > 0 && (
                        <span className="absolute top-0 right-0 h-4 w-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center border-2 border-white">
                           {unreadCount}
                        </span>
                     )}
                  </button>

                  {showNotifications && (
                     <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 overflow-hidden z-50">
                        <div className="p-4 border-b bg-gray-50">
                           <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                        </div>
                        <div className="max-h-96 overflow-y-auto">
                           {notifications.length === 0 ? (
                              <div className="p-4 text-center text-gray-500 text-sm">No notifications</div>
                           ) : (
                              notifications.map(notif => (
                                 <div key={notif.id} className={`p-4 border-b hover:bg-gray-50 ${!notif.read ? 'bg-blue-50/50' : ''}`}>
                                    <p className="text-sm text-gray-800">{notif.message}</p>
                                    <p className="text-xs text-gray-500 mt-1">{new Date(notif.timestamp).toLocaleString()}</p>
                                 </div>
                              ))
                           )}
                        </div>
                     </div>
                  )}
               </div>

               <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-gray-900">{currentMember.name}</p>
                  <p className="text-xs text-gray-500 font-mono">ID: {currentMember.uniqueId}</p>
               </div>
               <button
                  onClick={logout}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                  title="Sign Out"
               >
                  <LogOut size={20} />
               </button>
            </div>
         </header>

         {/* Main Content */}
         <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full space-y-6">

            {/* Navigation Tabs */}
            <div className="flex flex-wrap gap-2 bg-white p-1 rounded-xl shadow-sm border border-gray-100 w-full md:w-auto self-start">
               <button
                  onClick={() => setActiveTab('overview')}
                  className={`flex-1 md:flex-none px-6 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${activeTab === 'overview' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                     }`}
               >
                  Overview
               </button>
               <button
                  onClick={() => setActiveTab('loans')}
                  className={`flex-1 md:flex-none px-6 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${activeTab === 'loans' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                     }`}
               >
                  My Loans
               </button>
               <button
                  onClick={() => setActiveTab('guarantees')}
                  className={`flex-1 md:flex-none px-6 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap relative ${activeTab === 'guarantees' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                     }`}
               >
                  Guarantor Requests
                  {pendingGuaranteesCount > 0 && (
                     <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center border-2 border-white">
                        {pendingGuaranteesCount}
                     </span>
                  )}
               </button>
            </div>

            {activeTab === 'overview' && (
               <div className="space-y-6 animate-fade-in">
                  {/* Year Selector Control */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                     <h2 className="text-lg font-bold text-gray-800">Financial Overview</h2>
                     <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                        <button
                           onClick={() => setSelectedYear(y => y - 1)}
                           className="p-1.5 hover:bg-gray-50 rounded-md text-gray-500 hover:text-blue-600 transition-colors"
                           title="Previous Year"
                        >
                           <ChevronLeft size={18} />
                        </button>
                        <span className="font-mono font-bold text-blue-600 px-3 select-none text-lg">{selectedYear}</span>
                        <button
                           onClick={() => setSelectedYear(y => y + 1)}
                           className="p-1.5 hover:bg-gray-50 rounded-md text-gray-500 hover:text-blue-600 transition-colors"
                           title="Next Year"
                        >
                           <ChevronRight size={18} />
                        </button>
                     </div>
                  </div>

                  {/* Stats Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                     {/* Card 1: Lifetime Savings */}
                     <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-6 rounded-xl shadow-md text-white flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-4">
                           <div>
                              <p className="text-xs font-bold text-blue-200 uppercase tracking-wider">Lifetime Savings</p>
                              <p className="text-2xl font-bold mt-1">${lifetimeSavings.toLocaleString()}</p>
                           </div>
                           <div className="p-2 bg-white/20 rounded-lg">
                              <TrendingUp size={20} className="text-white" />
                           </div>
                        </div>
                        <p className="text-xs text-blue-100 opacity-80">Total accumulated savings across all years</p>
                     </div>

                     {/* Card 2: Selected Year Savings */}
                     <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-4">
                           <div>
                              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Saved in {selectedYear}</p>
                              <p className="text-2xl font-bold text-gray-900">${totalSavedSelectedYear.toLocaleString()}</p>
                           </div>
                           <div className="p-2 bg-green-50 rounded-lg">
                              <DollarSign size={20} className="text-green-600" />
                           </div>
                        </div>
                        <p className="text-xs text-gray-400">Contributions made in {selectedYear}</p>
                     </div>

                     {/* Card 3: Active Loans */}
                     <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-4">
                           <div>
                              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Loan Balance</p>
                              <p className="text-2xl font-bold text-gray-900">
                                 {/* Added explicit type to sum in reduce */}
                                 ${loans.filter(l => l.status === 'approved').reduce((sum: number, l: any) => sum + (l.amount - (l.repaidAmount || 0)), 0)}
                              </p>
                           </div>
                           <div className="p-2 bg-orange-50 rounded-lg">
                              <Calendar size={20} className="text-orange-600" />
                           </div>
                        </div>
                        <p className="text-xs text-gray-400">Total outstanding principal</p>
                     </div>

                     {/* Card 4: Late Fees */}
                     <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-4">
                           <div>
                              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Late Fees ({selectedYear})</p>
                              <p className="text-2xl font-bold text-red-600">${totalLateFeesSelectedYear}</p>
                           </div>
                           <div className="p-2 bg-red-50 rounded-lg">
                              <AlertCircle size={20} className="text-red-600" />
                           </div>
                        </div>
                        <p className="text-xs text-gray-400">Fees paid in {selectedYear}</p>
                     </div>
                  </div>

                  {/* Payment Calendar */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                     <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Calendar size={20} className="text-gray-400" />
                        Payment History <span className="text-blue-600">{selectedYear}</span>
                     </h3>
                     <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                        {months.map((month, index) => {
                           const amount = getPaymentValue(paymentsSelectedYear[index]);
                           const isPaid = amount > 0;
                           return (
                              <div key={month} className={`p-3 rounded-lg border flex flex-col items-center justify-center gap-1 transition-colors ${isPaid ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'
                                 }`}>
                                 <span className="text-xs font-semibold text-gray-500">{month}</span>
                                 {isPaid ? (
                                    <div className="flex items-center gap-1 text-green-700 font-bold">
                                       <span className="text-sm">${amount}</span>
                                    </div>
                                 ) : (
                                    <span className="text-gray-300 font-mono text-sm">-</span>
                                 )}
                              </div>
                           );
                        })}
                     </div>
                  </div>
               </div>
            )}

            {activeTab === 'loans' && (
               <div className="space-y-6 animate-fade-in">
                  {/* Request New Loan Form */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                     <h3 className="text-lg font-bold text-gray-800 mb-4">Request New Loan</h3>
                     <form onSubmit={handleLoanRequest} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                              <input
                                 type="number"
                                 required
                                 min="100"
                                 value={loanAmount}
                                 onChange={(e) => setLoanAmount(e.target.value)}
                                 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                 placeholder="e.g. 1000"
                              />
                           </div>
                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                              <input
                                 type="text"
                                 required
                                 value={loanReason}
                                 onChange={(e) => setLoanReason(e.target.value)}
                                 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                 placeholder="e.g. Home repair"
                              />
                           </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
                           <div className="col-span-1 md:col-span-2">
                              <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-2">
                                 <Users size={16} /> Select Guarantors
                                 <span className="text-xs font-normal text-gray-500">(Two members required)</span>
                              </h4>
                           </div>
                           <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Guarantor 1</label>
                              <select
                                 required
                                 value={guarantor1Id}
                                 onChange={(e) => setGuarantor1Id(e.target.value)}
                                 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                              >
                                 <option value="">Select a member...</option>
                                 {allMembers.filter(m => m.id !== guarantor2Id).map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                 ))}
                              </select>
                           </div>
                           <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Guarantor 2</label>
                              <select
                                 required
                                 value={guarantor2Id}
                                 onChange={(e) => setGuarantor2Id(e.target.value)}
                                 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                              >
                                 <option value="">Select a member...</option>
                                 {allMembers.filter(m => m.id !== guarantor1Id).map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                 ))}
                              </select>
                           </div>
                        </div>

                        <div className="pt-2">
                           <button
                              type="submit"
                              disabled={isSubmitting}
                              className="w-full md:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 shadow-sm"
                           >
                              {isSubmitting ? 'Sending...' : 'Submit Request'}
                           </button>
                        </div>
                     </form>
                  </div>

                  {/* Loans List */}
                  <div className="space-y-4">
                     <h3 className="text-lg font-bold text-gray-800">Loan History</h3>
                     {loans.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-xl text-gray-400 border border-gray-100">
                           No loans found.
                        </div>
                     ) : (
                        loans.map(loan => (
                           <div key={loan.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                              <div className="p-5 flex flex-col sm:flex-row justify-between gap-4">
                                 <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                       <span className={`px-2 py-0.5 rounded-full text-xs font-medium uppercase flex items-center gap-1
                                     ${loan.status === 'approved' ? 'bg-green-100 text-green-700' :
                                             loan.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                                loan.status === 'paid' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                                          }`}>
                                          {loan.status === 'approved' && <CheckCircle size={12} />}
                                          {loan.status === 'pending' && <Clock size={12} />}
                                          {loan.status === 'paid' && <CheckCircle size={12} />}
                                          {loan.status === 'rejected' && <XCircle size={12} />}
                                          {loan.status}
                                       </span>
                                       <span className="text-sm text-gray-400">{new Date(loan.requestDate).toLocaleDateString()}</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                       <span className="text-xl font-bold text-gray-900">${loan.amount}</span>
                                       <span className="text-gray-500 text-sm truncate max-w-[200px]"> - {loan.reason}</span>
                                    </div>

                                    {/* Guarantor Status for Applicant */}
                                    {loan.guarantors && loan.guarantors.length > 0 && (
                                       <div className="mt-3 text-sm">
                                          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Guarantors</p>
                                          <div className="flex gap-4">
                                             {loan.guarantors.map((g, idx) => (
                                                <div key={idx} className="flex items-center gap-1.5">
                                                   <div className={`w-2 h-2 rounded-full ${g.status === 'accepted' ? 'bg-green-500' :
                                                         g.status === 'rejected' ? 'bg-red-500' : 'bg-yellow-400'
                                                      }`} />
                                                   <span className="text-gray-700">{g.memberName}</span>
                                                </div>
                                             ))}
                                          </div>
                                       </div>
                                    )}

                                    {loan.status === 'approved' && (
                                       <div className="mt-3 max-w-sm">
                                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                                             <span>Paid: ${loan.repaidAmount || 0}</span>
                                             <span>Remaining: ${Math.max(0, loan.amount - (loan.repaidAmount || 0))}</span>
                                          </div>
                                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                             <div
                                                className="h-full bg-green-500 transition-all"
                                                style={{ width: `${Math.min(100, ((loan.repaidAmount || 0) / loan.amount) * 100)}%` }}
                                             ></div>
                                          </div>
                                       </div>
                                    )}
                                 </div>

                                 {(loan.repaymentHistory && loan.repaymentHistory.length > 0) && (
                                    <button
                                       onClick={() => setExpandedLoan(expandedLoan === loan.id ? null : loan.id)}
                                       className="self-start sm:self-center text-sm text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                    >
                                       {expandedLoan === loan.id ? 'Hide Details' : 'View Details'}
                                       {expandedLoan === loan.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>
                                 )}
                              </div>

                              {expandedLoan === loan.id && (
                                 <div className="bg-gray-50 border-t border-gray-100 p-4">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Repayment History</h4>
                                    <div className="space-y-2">
                                       {loan.repaymentHistory.map((rep, idx) => (
                                          <div key={idx} className="flex justify-between text-sm">
                                             <span className="text-gray-600">{new Date(rep.date).toLocaleDateString()}</span>
                                             <div className="flex gap-4">
                                                <span className="text-gray-500 italic">{rep.note}</span>
                                                <span className="font-medium text-gray-900">+${rep.amount}</span>
                                             </div>
                                          </div>
                                       ))}
                                    </div>
                                 </div>
                              )}
                           </div>
                        ))
                     )}
                  </div>
               </div>
            )}

            {activeTab === 'guarantees' && (
               <div className="space-y-6 animate-fade-in">
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                     <h3 className="text-lg font-bold text-gray-800 mb-2">Guarantor Requests</h3>
                     <p className="text-sm text-gray-500 mb-6">Requests from other members for you to guarantee their loans.</p>

                     {guaranteeRequests.length === 0 ? (
                        <div className="text-center py-10 bg-gray-50 rounded-lg text-gray-400 border border-dashed border-gray-200">
                           No guarantee requests found.
                        </div>
                     ) : (
                        <div className="grid gap-4">
                           {guaranteeRequests.map(req => {
                              const myStatus = req.guarantors?.find(g => g.memberId === currentMember.id)?.status;

                              return (
                                 <div key={req.id} className="border rounded-lg p-4 flex flex-col md:flex-row justify-between gap-4 items-start md:items-center hover:bg-gray-50 transition-colors">
                                    <div>
                                       <div className="flex items-center gap-2 mb-1">
                                          <span className="font-bold text-gray-900">{req.memberName}</span>
                                          <span className="text-gray-400 text-sm">is requesting</span>
                                          <span className="font-bold text-blue-600">${req.amount}</span>
                                       </div>
                                       <p className="text-sm text-gray-600 italic">"{req.reason}"</p>
                                       <div className="mt-2 text-xs text-gray-500">
                                          Requested on {new Date(req.requestDate).toLocaleDateString()}
                                       </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                       {myStatus === 'pending' && req.status === 'pending' ? (
                                          <>
                                             <button
                                                onClick={() => handleGuaranteeAction(req, 'accepted')}
                                                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                                             >
                                                <ShieldCheck size={16} /> Accept
                                             </button>
                                             <button
                                                onClick={() => handleGuaranteeAction(req, 'rejected')}
                                                className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 hover:bg-red-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                                             >
                                                <ShieldAlert size={16} /> Reject
                                             </button>
                                          </>
                                       ) : (
                                          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase flex items-center gap-1
                                           ${myStatus === 'accepted' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                             {myStatus === 'accepted' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                                             {myStatus}
                                          </span>
                                       )}
                                    </div>
                                 </div>
                              );
                           })}
                        </div>
                     )}
                  </div>
               </div>
            )}
         </main>
      </div>
   );
};

export default MemberPortal;
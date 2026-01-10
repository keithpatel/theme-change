
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
// @ts-ignore
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Member, LoanRequest } from '../types';
import {
  ArrowLeft,
  User,
  Phone,
  MapPin,
  Hash,
  CreditCard,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Calendar,
  History,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Clock,
  CircleDollarSign
} from 'lucide-react';

const MemberDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [member, setMember] = useState<Member | null>(null);
  const [loans, setLoans] = useState<LoanRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'savings' | 'loans'>('savings');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  useEffect(() => {
    if (id) {
      fetchMemberData();
    }
  }, [id]);

  const fetchMemberData = async () => {
    try {
      // 1. Fetch Member
      const memberDoc = await getDoc(doc(db, 'members', id!));
      if (!memberDoc.exists()) {
        navigate('/members');
        return;
      }
      setMember({ id: memberDoc.id, ...memberDoc.data() } as Member);

      // 2. Fetch Loans
      const loansQuery = query(collection(db, 'loans'), where('memberId', '==', id));
      const loansSnapshot = await getDocs(loansQuery);
      const loansList = loansSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LoanRequest[];
      setLoans(loansList.sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime()));

      setLoading(false);
    } catch (error) {
      console.error("Error fetching member details:", error);
      setLoading(false);
    }
  };

  const getPaymentValue = (val: any): number => {
    if (val === true) return 100;
    if (typeof val === 'number') return val;
    return 0;
  };

  // Calculations
  let lifetimeSavings = 0;
  let totalLateFees = 0;
  if (member?.payments) {
    Object.values(member.payments).forEach((yearData: any) => {
      Object.values(yearData).forEach((val: any) => {
        lifetimeSavings += getPaymentValue(val);
      });
    });
  }
  if (member?.lateFees) {
    Object.values(member.lateFees).forEach((yearData: any) => {
      Object.values(yearData).forEach((val: any) => {
        totalLateFees += (val as number || 0);
      });
    });
  }

  // Fix: Explicitly type 'sum' as number to resolve 'unknown' operator error
  const outstandingLoanBalance = loans
    .filter(l => l.status === 'approved')
    .reduce((sum: number, l) => sum + (l.amount - (l.repaidAmount || 0)), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!member) return null;

  return (
    <div className="space-y-6">
      {/* Top Header & Back Button */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/members')}
          className="p-2 bg-white rounded-lg shadow-sm border border-gray-200 text-gray-600 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{member.name}</h2>
          <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
            <span className="flex items-center gap-1 font-mono text-blue-600 font-bold">
              <Hash size={14} /> {member.uniqueId}
            </span>
            <span>Joined: {new Date(member.joinedDate).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Profile Overview Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
              <User size={32} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Member Contact</p>
              <p className="text-lg font-bold text-gray-900">{member.name}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3 text-gray-600">
              <div className="p-2 bg-gray-50 rounded-lg">
                <Phone size={18} />
              </div>
              <a href={`tel:${member.phone}`} className="hover:text-blue-600 hover:underline">{member.phone}</a>
            </div>
            <div className="flex items-start gap-3 text-gray-600">
              <div className="p-2 bg-gray-50 rounded-lg shrink-0">
                <MapPin size={18} />
              </div>
              <span className="text-sm pt-1">{member.address || 'No address provided'}</span>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Status</p>
              <span className="inline-block mt-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full uppercase">Active</span>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">Loans</p>
              <p className="mt-1 text-sm font-bold text-gray-900">{loans.length} Total</p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-blue-600 rounded-xl shadow-md p-6 text-white flex flex-col justify-between">
            <div>
              <p className="text-xs font-bold text-blue-200 uppercase tracking-wider">Lifetime Savings</p>
              <p className="text-3xl font-bold mt-1">${lifetimeSavings.toLocaleString()}</p>
            </div>
            <TrendingUp size={24} className="opacity-50 mt-4" />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Late Fees</p>
              <p className="text-3xl font-bold mt-1 text-red-600">${totalLateFees.toLocaleString()}</p>
            </div>
            <AlertCircle size={24} className="text-red-100 mt-4" />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Current Debt</p>
              <p className="text-3xl font-bold mt-1 text-gray-900">${outstandingLoanBalance.toLocaleString()}</p>
            </div>
            <DollarSign size={24} className="text-gray-100 mt-4" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('savings')}
            className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === 'savings' ? 'text-blue-600 bg-blue-50/50 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Savings & Fees History
          </button>
          <button
            onClick={() => setActiveTab('loans')}
            className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === 'loans' ? 'text-blue-600 bg-blue-50/50 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Loan Activity
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'savings' ? (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Calendar size={20} className="text-gray-400" /> Monthly Contributions
                </h3>
                <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border">
                  <button onClick={() => setSelectedYear(y => y - 1)} className="p-1 hover:bg-white rounded transition-all text-gray-500"><ChevronLeft size={18} /></button>
                  <span className="font-mono font-bold text-blue-600 px-2">{selectedYear}</span>
                  <button onClick={() => setSelectedYear(y => y + 1)} className="p-1 hover:bg-white rounded transition-all text-gray-500"><ChevronRight size={18} /></button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {months.map((m, idx) => {
                  const amount = getPaymentValue(member.payments?.[selectedYear]?.[idx]);
                  const fee = member.lateFees?.[selectedYear]?.[idx] || 0;

                  return (
                    <div key={m} className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${amount > 0 ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                      <span className="text-[10px] font-bold text-gray-500 uppercase">{m}</span>
                      <span className={`text-lg font-bold ${amount > 0 ? 'text-green-700' : 'text-gray-400'}`}>${amount}</span>
                      {fee > 0 && (
                        <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full mt-1 flex items-center gap-0.5">
                          <AlertCircle size={10} /> Fee: ${fee}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 pt-6 border-t border-gray-100 flex justify-between items-center text-sm">
                <span className="text-gray-500">Total for {selectedYear}:</span>
                <span className="font-bold text-blue-700 text-lg">
                  {/* Fix: Explicitly type 'sum' as number to resolve 'unknown' operator error */}
                  ${Object.values(member.payments?.[selectedYear] || {}).reduce((sum: number, v) => sum + getPaymentValue(v), 0)}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {loans.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <CircleDollarSign size={48} className="mx-auto mb-3 opacity-20" />
                  <p>No historical loans found for this member.</p>
                </div>
              ) : (
                loans.map(loan => {
                  const repaid = loan.repaidAmount || 0;
                  const progress = Math.min(100, (repaid / loan.amount) * 100);

                  return (
                    <div key={loan.id} className="p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider
                                  ${loan.status === 'paid' ? 'bg-blue-100 text-blue-700' :
                                loan.status === 'approved' ? 'bg-green-100 text-green-700' :
                                  loan.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                              }`}>
                              {loan.status}
                            </span>
                            <span className="text-xs text-gray-500">{new Date(loan.requestDate).toLocaleDateString()}</span>
                          </div>
                          <h4 className="font-bold text-gray-900 mt-1">${loan.amount.toLocaleString()} <span className="text-gray-400 font-normal text-sm">- {loan.reason}</span></h4>
                        </div>

                        {loan.status === 'approved' && (
                          <div className="text-right">
                            <p className="text-xs text-gray-500 uppercase">Balance</p>
                            <p className="font-bold text-blue-600">${(loan.amount - repaid).toLocaleString()}</p>
                          </div>
                        )}
                      </div>

                      {loan.status !== 'pending' && loan.status !== 'rejected' && (
                        <div className="mt-4">
                          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                            <span>REPAID ${repaid.toLocaleString()}</span>
                            <span>{progress.toFixed(0)}%</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }}></div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MemberDetails;

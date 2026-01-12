import { useState, useEffect } from 'react';
// @ts-ignore
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Member, UserRole } from '../types';
import { useAuth } from '../App';
import { ChevronLeft, ChevronRight, Filter, AlertCircle, Search } from 'lucide-react';

const Payments = () => {
  const { role } = useAuth();
  const isAdminView = role === UserRole.ADMIN_VIEW;
  const [members, setMembers] = useState<Member[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [viewMode, setViewMode] = useState<'savings' | 'lateFees'>('savings');
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'unpaid'>('all');

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  // Get current month details for the filter
  const currentMonthIndex = new Date().getMonth();
  const currentMonthName = months[currentMonthIndex];

  const paymentOptions = [0, 100, 200, 500];

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'members'));
      const membersList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Member[];
      // Sort members by name alphabetically
      membersList.sort((a, b) => a.name.localeCompare(b.name));
      setMembers(membersList);
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  };

  const updatePaymentAmount = async (memberId: string, monthIndex: number, amount: number) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return;

    // Optimistic Update
    const updatedMembers = members.map(m => {
      if (m.id === memberId) {
        return {
          ...m,
          payments: {
            ...m.payments,
            [year]: {
              ...(m.payments?.[year] || {}),
              [monthIndex]: amount
            }
          }
        };
      }
      return m;
    });
    setMembers(updatedMembers);

    // Update Firebase
    try {
      const memberRef = doc(db, 'members', memberId);
      await updateDoc(memberRef, {
        [`payments.${year}.${monthIndex}`]: amount
      });
    } catch (error) {
      console.error("Error updating payment:", error);
      fetchMembers(); // Revert on error
    }
  };

  const updateLateFee = async (memberId: string, monthIndex: number, amount: number) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return;

    // Optimistic Update
    const updatedMembers = members.map(m => {
      if (m.id === memberId) {
        return {
          ...m,
          lateFees: {
            ...m.lateFees,
            [year]: {
              ...(m.lateFees?.[year] || {}),
              [monthIndex]: amount
            }
          }
        };
      }
      return m;
    });
    setMembers(updatedMembers);

    // Update Firebase
    try {
      const memberRef = doc(db, 'members', memberId);
      await updateDoc(memberRef, {
        [`lateFees.${year}.${monthIndex}`]: amount
      });
    } catch (error) {
      console.error("Error updating late fee:", error);
      fetchMembers(); // Revert on error
    }
  };

  const getPaymentValue = (val: number | boolean | undefined): number => {
    if (val === true) return 100; // Legacy support
    if (typeof val === 'number') return val;
    return 0;
  };

  const getLateFeeValue = (member: Member, monthIndex: number): number => {
    return member.lateFees?.[year]?.[monthIndex] || 0;
  };

  const getAmountColor = (amount: number) => {
    if (amount === 500) return 'bg-blue-100 text-blue-700 border-blue-200';
    if (amount === 200) return 'bg-teal-100 text-teal-700 border-teal-200';
    if (amount === 100) return 'bg-green-100 text-green-700 border-green-200';
    return 'bg-gray-50 text-gray-400 border-transparent';
  };

  const getLateFeeColor = (amount: number) => {
    if (amount > 0) return 'bg-red-50 text-red-600 border-red-200 font-bold';
    return 'bg-gray-50 text-gray-400 border-transparent';
  };

  const filteredMembers = members.filter(m => {
    // 1. Search Filter
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.uniqueId.includes(searchTerm);

    if (!matchesSearch) return false;

    // 2. Payment Status Filter (Paid/Unpaid for Current Month)
    if (paymentFilter !== 'all') {
      const amount = getPaymentValue(m.payments?.[year]?.[currentMonthIndex]);
      const isPaid = amount > 0;

      if (paymentFilter === 'paid' && !isPaid) return false;
      if (paymentFilter === 'unpaid' && isPaid) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Monthly Tracker</h2>
          <p className="text-gray-500 text-sm">Manage savings contributions and late fees.</p>
        </div>

        <div className="flex flex-col sm:flex-row w-full lg:w-auto items-start sm:items-center gap-3">
          {/* Search Bar */}
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search member..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            />
          </div>

          {/* Payment Status Filter */}
          <div className="relative w-full sm:w-auto min-w-[180px]">
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as any)}
              className="w-full appearance-none bg-white border border-gray-300 text-gray-700 py-2 pl-3 pr-8 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="paid">Paid ({currentMonthName})</option>
              <option value="unpaid">Unpaid ({currentMonthName})</option>
            </select>
            <Filter className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
          </div>

          <div className="flex w-full sm:w-auto gap-3">
            {/* View Toggle */}
            <div className="flex bg-white rounded-lg p-1 border shadow-sm flex-1 sm:flex-none">
              <button
                onClick={() => setViewMode('savings')}
                className={`flex-1 sm:flex-none px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'savings' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                  }`}
              >
                Savings
              </button>
              <button
                onClick={() => setViewMode('lateFees')}
                className={`flex-1 sm:flex-none px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-1 ${viewMode === 'lateFees' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                  }`}
              >
                <AlertCircle size={14} /> Late Fees
              </button>
            </div>

            {/* Year Selector */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg shadow-sm border border-gray-100">
              <button
                onClick={() => setYear(y => y - 1)}
                className="p-1 hover:bg-gray-100 rounded-full text-gray-500"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="font-bold text-base text-blue-600 min-w-[3ch] text-center">{year}</span>
              <button
                onClick={() => setYear(y => y + 1)}
                className="p-1 hover:bg-gray-100 rounded-full text-gray-500"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-4 text-left font-semibold text-gray-600 sticky left-0 bg-gray-50 z-10 w-48 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  Member
                </th>
                {months.map(month => (
                  <th key={month} className="px-2 py-4 text-center text-sm font-semibold text-gray-600 min-w-[80px]">
                    {month}
                  </th>
                ))}
                <th className="px-4 py-4 text-center font-semibold text-gray-600">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={14} className="text-center py-8 text-gray-500">
                    No members found matching "{searchTerm}" {paymentFilter !== 'all' ? `with status "${paymentFilter}"` : ''}
                  </td>
                </tr>
              ) : (
                filteredMembers.map(member => {
                  const yearPayments = member.payments?.[year] || {};
                  const yearLateFees = member.lateFees?.[year] || {};

                  // Calculate Total based on view mode
                  const rowTotal = viewMode === 'savings'
                    ? Object.values(yearPayments).reduce((sum: number, val) => sum + getPaymentValue(val as number | boolean), 0)
                    : Object.values(yearLateFees).reduce((sum: number, val) => sum + ((val as number) || 0), 0);

                  return (
                    <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900 sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        <div>
                          {member.name}
                          <div className="text-xs text-gray-500 font-mono">#{member.uniqueId}</div>
                        </div>
                      </td>
                      {months.map((_, index) => {
                        if (viewMode === 'savings') {
                          const amount = getPaymentValue(yearPayments[index]);
                          return (
                            <td key={index} className="px-1 py-3 text-center">
                              <select
                                value={amount}
                                disabled={isAdminView}
                                onChange={(e) => updatePaymentAmount(member.id, index, parseInt(e.target.value))}
                                className={`w-full text-xs font-bold py-1.5 px-1 rounded border appearance-none text-center cursor-pointer outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${getAmountColor(amount)} ${isAdminView ? 'opacity-75 cursor-not-allowed' : ''}`}
                              >
                                <option value={0} className="text-gray-400">-</option>
                                {paymentOptions.filter(opt => opt > 0).map(opt => (
                                  <option key={opt} value={opt} className="text-gray-900 font-medium">
                                    ${opt}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        } else {
                          // Late Fees View
                          const fee = getLateFeeValue(member, index);
                          return (
                            <td key={index} className="px-1 py-3 text-center">
                              <input
                                type="number"
                                min="0"
                                value={fee === 0 ? '' : fee}
                                disabled={isAdminView}
                                placeholder="-"
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                  updateLateFee(member.id, index, val);
                                }}
                                className={`w-full text-xs py-1.5 px-1 rounded border text-center outline-none focus:ring-2 focus:ring-red-500 transition-colors ${getLateFeeColor(fee)} ${isAdminView ? 'opacity-75 cursor-not-allowed' : ''}`}
                              />
                            </td>
                          );
                        }
                      })}
                      <td className={`px-4 py-3 text-center font-bold ${viewMode === 'savings' ? 'text-gray-700' : 'text-red-600'}`}>
                        ${rowTotal}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Payments;
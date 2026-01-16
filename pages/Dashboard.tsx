import { useEffect, useState } from 'react';
// @ts-ignore
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';
import { UserRole } from '../types';
import {
    PiggyBank,
    Wallet,
    HandCoins,
    Percent,
    TrendingUp,
    Calendar,
    FileText,
    Printer,
    X,
    ChevronLeft,
    ChevronRight,
    Share2,
    RotateCcw,
    AlertTriangle
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ReportData {
    month: number;
    year: number;
    generatedAt: string;

    // Cash Flow Statement
    openingBalance: number;

    // Income
    totalSavings: number;
    totalLateFees: number;
    totalRepaid: number;
    totalIncome: number;

    // Expenses
    totalDisbursed: number;
    totalWithdrawals: number; // Added missing property to store the numeric total of withdrawals
    totalExpenses: number;

    // Closing
    closingBalance: number;

    // Details Lists
    savingsList: { name: string; amount: number; lateFee: number; total: number }[];
    disbursements: { member: string; amount: number; date: string; interestRate: number; duration: number }[];
    repayments: { member: string; amount: number; date: string; note?: string }[];
    withdrawals: { member: string; amount: number; interest: number; total: number; date: string }[];

    // Assets Snapshot (Money with members)
    outstandingLoans: { member: string; loanDate: string; originalAmount: number; balance: number }[];
    totalOutstandingPrincipal: number;
}

const StatCard = ({ title, value, subtext, icon: Icon, iconColor, valuePrefix = '$' }: any) => (
    <div className="bg-white rounded-xl shadow-sm p-6 flex justify-between items-start border border-gray-100 transition-shadow hover:shadow-md">
        <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{title}</p>
            <h3 className="text-3xl font-bold text-gray-900 mb-1">{valuePrefix}{value.toLocaleString()}</h3>
            <p className="text-xs text-gray-400">{subtext}</p>
        </div>
        <div className={`p-3 rounded-lg ${iconColor} shadow-sm`}>
            <Icon className="text-white" size={24} />
        </div>
    </div>
);

const Dashboard = () => {
    const { role } = useAuth();
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [stats, setStats] = useState({
        totalCollected: 0,
        availableBalance: 0,
        outstandingPrincipal: 0,
        totalInterest: 0,
        interestThisMonth: 0,
        disbursedThisMonth: 0,
        totalLateFees: 0,
        totalWithdrawals: 0,
        delinquentCount: 0
    });
    const [chartData, setChartData] = useState<any[]>([]);

    // Report State
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportConfig, setReportConfig] = useState({ month: new Date().getMonth(), year: new Date().getFullYear() });
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSharing, setIsSharing] = useState(false);

    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    useEffect(() => {
        fetchDashboardData();
    }, [selectedYear]);

    const fetchDashboardData = async () => {
        try {
            const currentMonthIndex = new Date().getMonth();
            const currentRealYear = new Date().getFullYear();
            const today = new Date();

            // 1. Fetch Members & Calculate Collections (Savings + Late Fees)
            const membersSnapshot = await getDocs(collection(db, 'members'));
            const members = membersSnapshot.docs.map(doc => doc.data());

            let collectedSavings = 0;
            let collectedLateFees = 0;
            const monthlyData = Array(12).fill(0).map((_, i) => ({
                name: new Date(0, i).toLocaleString('default', { month: 'short' }),
                amount: 0
            }));

            members.forEach((m: any) => {
                // Savings
                if (m.payments) {
                    Object.keys(m.payments).forEach(yearKey => {
                        const year = parseInt(yearKey);
                        const yearPayments = m.payments[year];
                        if (yearPayments) {
                            Object.keys(yearPayments).forEach(monthKey => {
                                const month = parseInt(monthKey);
                                const val = yearPayments[month];
                                let amount = 0;
                                if (typeof val === 'number') amount = val;
                                else if (val === true) amount = 100;

                                if (amount > 0) {
                                    collectedSavings += amount;
                                    // Filter chart data by the selected year from dropdown
                                    if (year === selectedYear && month >= 0 && month < 12) {
                                        monthlyData[month].amount += amount;
                                    }
                                }
                            });
                        }
                    });
                }

                // Late Fees
                if (m.lateFees) {
                    Object.keys(m.lateFees).forEach(yearKey => {
                        const year = parseInt(yearKey);
                        const yearFees = m.lateFees[year];
                        if (yearFees) {
                            Object.keys(yearFees).forEach(monthKey => {
                                const amount = yearFees[parseInt(monthKey)] || 0;
                                if (amount > 0) {
                                    collectedLateFees += amount;
                                }
                            });
                        }
                    });
                }
            });

            const totalCollected = collectedSavings + collectedLateFees;

            // 2. Fetch Loans & Calculate Loan Stats
            const loansSnapshot = await getDocs(collection(db, 'loans'));
            const loans = loansSnapshot.docs.map(doc => doc.data());

            let totalDisbursed = 0;
            let totalRepaid = 0;
            let outstanding = 0;
            let totalInterest = 0;
            let interestMonth = 0;
            let disbursedMonth = 0;
            let delinquentCount = 0;

            loans.forEach((l: any) => {
                if (l.status === 'approved' || l.status === 'paid') {
                    const disbursed = l.disbursedAmount || l.amount;
                    const interest = l.totalInterest || 0;
                    const repaid = l.repaidAmount || 0;

                    totalDisbursed += disbursed;
                    totalRepaid += repaid;
                    totalInterest += interest;
                    outstanding += (l.amount - repaid);

                    const loanDate = new Date(l.requestDate);
                    // Stats "This Month" always refers to current real time
                    if (loanDate.getMonth() === currentMonthIndex && loanDate.getFullYear() === currentRealYear) {
                        interestMonth += interest;
                        disbursedMonth += disbursed;
                    }

                    // Delinquency Check: status approved and past final due date
                    if (l.status === 'approved') {
                        const duration = l.durationMonths || 12;
                        const finalDueDate = new Date(l.requestDate);
                        finalDueDate.setMonth(finalDueDate.getMonth() + duration);
                        if (today > finalDueDate) {
                            delinquentCount++;
                        }
                    }
                }
            });

            // 3. Fetch Withdrawals
            const withdrawalsSnapshot = await getDocs(collection(db, 'withdrawals'));
            let totalWithdrawals = 0;
            withdrawalsSnapshot.forEach(doc => {
                const w = doc.data();
                totalWithdrawals += (w.totalPayout || 0);
            });

            const available = totalCollected + totalRepaid - totalDisbursed - totalWithdrawals;

            setStats({
                totalCollected,
                availableBalance: available,
                outstandingPrincipal: outstanding,
                totalInterest,
                interestThisMonth: interestMonth,
                disbursedThisMonth: disbursedMonth,
                totalLateFees: collectedLateFees,
                totalWithdrawals,
                delinquentCount
            });

            setChartData(monthlyData);
        } catch (error) {
            console.error("Error fetching dashboard data:", error);
        }
    };

    const generateReport = async () => {
        setIsGenerating(true);
        try {
            const { month, year } = reportConfig;

            const reportStartDate = new Date(year, month, 1);
            const reportEndDate = new Date(year, month + 1, 0, 23, 59, 59);

            // 1. Calculate Savings & Fees
            const membersSnapshot = await getDocs(collection(db, 'members'));

            const savingsList: { name: string; amount: number; lateFee: number; total: number }[] = [];

            let currentMonthSavings = 0;
            let currentMonthFees = 0;

            let cumulativeSavingsBefore = 0;
            let cumulativeFeesBefore = 0;

            membersSnapshot.forEach(doc => {
                const m = doc.data();

                if (m.payments) {
                    Object.keys(m.payments).forEach(yKey => {
                        const y = parseInt(yKey);
                        const yearPayments = m.payments[y];
                        if (yearPayments) {
                            Object.keys(yearPayments).forEach(mKey => {
                                const mIdx = parseInt(mKey);
                                let val = yearPayments[mIdx];
                                let amt = 0;
                                if (typeof val === 'number') amt = val;
                                else if (val === true) amt = 100;

                                if (y < year || (y === year && mIdx < month)) {
                                    cumulativeSavingsBefore += amt;
                                } else if (y === year && mIdx === month) {
                                    currentMonthSavings += amt;
                                }
                            });
                        }
                    });
                }

                if (m.lateFees) {
                    Object.keys(m.lateFees).forEach(yKey => {
                        const y = parseInt(yKey);
                        const yearFees = m.lateFees[y];
                        if (yearFees) {
                            Object.keys(yearFees).forEach(mKey => {
                                const mIdx = parseInt(mKey);
                                const amt = yearFees[mIdx] || 0;

                                if (y < year || (y === year && mIdx < month)) {
                                    cumulativeFeesBefore += amt;
                                } else if (y === year && mIdx === month) {
                                    currentMonthFees += amt;
                                }
                            });
                        }
                    });
                }

                const thisMonthSaving = m.payments?.[year]?.[month];
                let saveAmt = 0;
                if (typeof thisMonthSaving === 'number') saveAmt = thisMonthSaving;
                else if (thisMonthSaving === true) saveAmt = 100;

                const thisMonthFee = m.lateFees?.[year]?.[month] || 0;

                if (saveAmt > 0 || thisMonthFee > 0) {
                    savingsList.push({
                        name: m.name,
                        amount: saveAmt,
                        lateFee: thisMonthFee,
                        total: saveAmt + thisMonthFee
                    });
                }
            });

            savingsList.sort((a, b) => a.name.localeCompare(b.name));

            // 2. Calculate Loans & Repayments
            const loansSnapshot = await getDocs(collection(db, 'loans'));

            const disbursements: any[] = [];
            const repayments: any[] = [];
            const outstandingLoans: any[] = [];

            let currentMonthDisbursed = 0;
            let currentMonthRepaid = 0;

            let cumulativeDisbursedBefore = 0;
            let cumulativeRepaidBefore = 0;

            let totalOutstandingPrincipal = 0;

            loansSnapshot.forEach(doc => {
                const loan = doc.data();

                if (loan.status === 'approved' || loan.status === 'paid') {
                    const reqDate = new Date(loan.requestDate);
                    const loanAmount = loan.disbursedAmount || loan.amount;

                    if (reqDate < reportStartDate) {
                        cumulativeDisbursedBefore += loanAmount;
                    } else if (reqDate <= reportEndDate) {
                        currentMonthDisbursed += loanAmount;
                        disbursements.push({
                            member: loan.memberName,
                            amount: loanAmount,
                            date: reqDate.toLocaleDateString(),
                            interestRate: loan.interestRate || 0,
                            duration: loan.durationMonths || 0
                        });
                    }
                }

                let loanRepaidBefore = 0;
                let loanRepaidThisMonth = 0;

                if (loan.repaymentHistory) {
                    loan.repaymentHistory.forEach((rep: any) => {
                        const repDate = new Date(rep.date);

                        if (repDate < reportStartDate) {
                            cumulativeRepaidBefore += rep.amount;
                            loanRepaidBefore += rep.amount;
                        } else if (repDate <= reportEndDate) {
                            currentMonthRepaid += rep.amount;
                            loanRepaidThisMonth += rep.amount;
                            repayments.push({
                                member: loan.memberName,
                                amount: rep.amount,
                                date: repDate.toLocaleDateString(),
                                note: rep.note
                            });
                        }
                    });
                }

                if ((loan.status === 'approved' || loan.status === 'paid') && new Date(loan.requestDate) <= reportEndDate) {
                    const totalRepaidByEndOfMonth = loanRepaidBefore + loanRepaidThisMonth;
                    const balance = loan.amount - totalRepaidByEndOfMonth;

                    if (balance > 0) {
                        outstandingLoans.push({
                            member: loan.memberName,
                            loanDate: new Date(loan.requestDate).toLocaleDateString(),
                            originalAmount: loan.amount,
                            balance: balance
                        });
                        totalOutstandingPrincipal += balance;
                    }
                }
            });

            // 3. Withdrawals
            const withdrawalsSnapshot = await getDocs(collection(db, 'withdrawals'));
            const withdrawals: any[] = [];
            let currentMonthWithdrawals = 0;
            let cumulativeWithdrawalsBefore = 0;

            withdrawalsSnapshot.forEach(doc => {
                const w = doc.data();
                const wDate = new Date(w.date);

                if (wDate < reportStartDate) {
                    cumulativeWithdrawalsBefore += (w.totalPayout || 0);
                } else if (wDate <= reportEndDate) {
                    currentMonthWithdrawals += (w.totalPayout || 0);
                    withdrawals.push({
                        member: w.memberId || w.memberName, // Handle legacy
                        name: w.memberName,
                        amount: w.totalSavings || w.totalPayout,
                        interest: w.interestAmount || 0,
                        total: w.totalPayout,
                        date: wDate.toLocaleDateString()
                    });
                }
            });

            const openingBalance = (cumulativeSavingsBefore + cumulativeFeesBefore + cumulativeRepaidBefore) - cumulativeDisbursedBefore - cumulativeWithdrawalsBefore;

            const totalIncome = currentMonthSavings + currentMonthFees + currentMonthRepaid;
            const totalExpenses = currentMonthDisbursed + currentMonthWithdrawals;

            const closingBalance = openingBalance + totalIncome - totalExpenses;

            // Fix for Error: Property 'map' does not exist on type 'number'.
            setReportData({
                month,
                year,
                generatedAt: new Date().toLocaleString(),
                openingBalance,
                totalSavings: currentMonthSavings,
                totalLateFees: currentMonthFees,
                totalRepaid: currentMonthRepaid,
                totalIncome,
                totalDisbursed: currentMonthDisbursed,
                totalWithdrawals: currentMonthWithdrawals, // Use numeric total instead of trying to .map() it
                totalExpenses,
                closingBalance,
                savingsList,
                disbursements,
                repayments,
                withdrawals: withdrawals.map((w: any) => ({ // Map the withdrawals array to fixed detail structure
                    member: w.name,
                    amount: w.amount,
                    interest: w.interest,
                    total: w.total,
                    date: w.date
                })),
                outstandingLoans,
                totalOutstandingPrincipal
            });

        } catch (error) {
            console.error("Error generating report:", error);
            alert("Failed to generate report. Please try again.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handleShare = async () => {
        const element = document.getElementById('printable-report');
        if (!element || !reportData) return;
        setIsSharing(true);

        const opt = {
            margin: 10,
            filename: `Report_${months[reportData.month]}_${reportData.year}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        try {
            // @ts-ignore
            if (window.html2pdf) {
                // Direct output to blob - more robust method for mobile
                // @ts-ignore
                const pdfBlob = await window.html2pdf().from(element).set(opt).output('blob');

                // Verify blob is valid
                if (!pdfBlob || pdfBlob.size < 100) {
                    throw new Error("Generated PDF is empty");
                }

                const file = new File([pdfBlob], opt.filename, { type: 'application/pdf', lastModified: Date.now() });

                if (navigator.canShare && navigator.share) {
                    try {
                        await navigator.share({
                            files: [file],
                            title: 'Monthly Report'
                        });
                    } catch (shareError: any) {
                        if (shareError.name !== 'AbortError') {
                            console.error("Share failed", shareError);
                            // Fallback if share fails (but not if cancelled)
                            const url = URL.createObjectURL(pdfBlob);
                            window.open(url, '_blank');
                        }
                    }
                } else {
                    // Fallback: Preview in new tab
                    const url = URL.createObjectURL(pdfBlob);
                    window.open(url, '_blank');
                }
            } else {
                alert("PDF library not loaded. Please refresh.");
            }
        } catch (error) {
            console.error("Error generating PDF:", error);
            alert("Could not share PDF. Please try 'Print' button instead.");
        } finally {
            setIsSharing(false);
        }
    };

    return (
        <div className="space-y-8">
            {/* Inline Print Styles */}
            <style>
                {`
          @media print {
            /* Reset root elements to allow full page printing */
            html, body {
              visibility: hidden;
              height: auto !important;
              overflow: visible !important;
              margin: 0 !important;
              padding: 0 !important;
              background: white;
            }
            
            /* Hide all other app elements */
            body * {
              visibility: hidden;
            }
            
            /* Target the report container */
            #printable-report {
              visibility: visible;
              position: absolute;
              left: 0;
              top: 0;
              
              /* Force full width of the printable area */
              width: 100% !important;
              height: auto !important;
              
              /* Remove any internal spacing that conflicts with margins */
              margin: 0 !important;
              padding: 0 !important;
              
              background: white;
              color: black;
              font-size: 10pt; /* Slightly smaller for better fit */
            }
            
            /* Ensure children of report are visible */
            #printable-report * {
              visibility: visible;
            }
            
            /* Explicitly hide helper elements */
            .no-print {
                display: none !important;
            }
            
            /* Table Styling */
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 4px; font-size: 0.85rem; }
            thead { border-bottom: 2px solid #374151; display: table-header-group; }
            tr { page-break-inside: avoid; }
            
            /* High Contrast */
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                border-color: #e5e7eb;
            }

            /* Containers */
            .section-container {
               page-break-inside: avoid;
               break-inside: avoid;
               margin-bottom: 15px;
               border: 1px solid #d1d5db; /* darker gray for print */
               border-radius: 6px;
               padding: 10px;
            }
            
            .section-title {
               font-weight: bold;
               text-transform: uppercase;
               font-size: 0.8rem;
               color: #111827;
               border-bottom: 1px solid #d1d5db;
               padding-bottom: 4px;
               margin-bottom: 8px;
            }

            /* Remove backgrounds */
            .bg-gray-50, .bg-gray-100 {
                background-color: transparent !important;
            }
            
            @page {
              size: auto;
              margin: 10mm 15mm; /* Top/Bottom 10mm, Left/Right 15mm */
            }
          }
        `}
            </style>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">Dashboard</h2>
                    <p className="text-gray-500 mt-1">Overview of community funds & loans.</p>
                </div>
                {role === UserRole.ADMIN && (
                    <button
                        onClick={() => { setIsReportModalOpen(true); setReportData(null); }}
                        className="flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg transition-colors font-medium shadow-sm"
                    >
                        <FileText size={18} />
                        Monthly Report
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Collected"
                    value={stats.totalCollected}
                    subtext={`Incl. $${stats.totalLateFees.toLocaleString()} in fees`}
                    icon={PiggyBank}
                    iconColor="bg-blue-500"
                />
                <StatCard
                    title="Available Balance"
                    value={stats.availableBalance}
                    subtext="Cash in hand"
                    icon={Wallet}
                    iconColor="bg-green-600"
                />
                <StatCard
                    title="Total Refunds"
                    value={stats.totalWithdrawals}
                    subtext="Lifetime refunds given"
                    icon={RotateCcw}
                    iconColor="bg-blue-400"
                />
                <StatCard
                    title="Total Loans Unpaid"
                    value={stats.outstandingPrincipal}
                    subtext="Outstanding principal"
                    icon={HandCoins}
                    iconColor="bg-red-500"
                />
                <StatCard
                    title="Delinquent Loans"
                    value={stats.delinquentCount}
                    valuePrefix=""
                    subtext="Past final due date"
                    icon={AlertTriangle}
                    iconColor="bg-red-600"
                />
                <StatCard
                    title="Total Interest"
                    value={stats.totalInterest}
                    subtext="Total earnings"
                    icon={Percent}
                    iconColor="bg-blue-600"
                />
                <StatCard
                    title="Interest This Month"
                    value={stats.interestThisMonth}
                    subtext="Generated from new loans"
                    icon={TrendingUp}
                    iconColor="bg-teal-500"
                />
                <StatCard
                    title="Loans This Month"
                    value={stats.disbursedThisMonth}
                    subtext="Disbursed amount"
                    icon={Calendar}
                    iconColor="bg-orange-500"
                />
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-800">Monthly Savings ({selectedYear})</h3>
                    <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-gray-200">
                        <button
                            onClick={() => setSelectedYear(y => y - 1)}
                            className="p-1.5 hover:bg-white hover:shadow-sm rounded text-gray-600 transition-all"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <span className="font-mono font-bold text-blue-600 px-2 select-none">{selectedYear}</span>
                        <button
                            onClick={() => setSelectedYear(y => y + 1)}
                            className="p-1.5 hover:bg-white hover:shadow-sm rounded text-gray-600 transition-all"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
                <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} tickFormatter={(value) => `$${value}`} />
                            <Tooltip
                                cursor={{ fill: '#f9fafb' }}
                                formatter={(value: number) => [`$${value}`, 'Savings']}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} barSize={50} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Report Modal */}
            {isReportModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100] animate-fade-in">
                    <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden">
                        {/* Modal Header */}
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50 print:hidden">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <FileText size={20} className="text-blue-600" />
                                Monthly Report
                            </h3>
                            <div className="flex gap-2">
                                {reportData && (
                                    <button onClick={handlePrint} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Print Report">
                                        <Printer size={20} />
                                    </button>
                                )}
                                <button onClick={() => setIsReportModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Content */}
                        <div className="flex-1 overflow-y-auto p-6 bg-gray-100 print:p-0 print:bg-white">
                            {!reportData ? (
                                /* Configuration State */
                                <div className="bg-white p-8 rounded-xl shadow-sm max-w-md mx-auto mt-10">
                                    <h4 className="text-center font-bold text-gray-900 mb-6">Select Report Period</h4>
                                    <div className="grid grid-cols-2 gap-4 mb-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                                            <select
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                value={reportConfig.month}
                                                onChange={(e) => setReportConfig({ ...reportConfig, month: parseInt(e.target.value) })}
                                            >
                                                {months.map((m, i) => (
                                                    <option key={i} value={i}>{m}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                                            <input
                                                type="number"
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                value={reportConfig.year}
                                                onChange={(e) => setReportConfig({ ...reportConfig, year: parseInt(e.target.value) })}
                                            />
                                        </div>
                                    </div>
                                    <button
                                        onClick={generateReport}
                                        disabled={isGenerating}
                                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm flex justify-center items-center gap-2 transition-colors"
                                    >
                                        {isGenerating ? 'Generating...' : 'Generate Report'}
                                    </button>
                                </div>
                            ) : (
                                /* Printable Report View */
                                <div id="printable-report" className="bg-white p-8 sm:rounded-xl shadow-sm max-w-4xl mx-auto border border-gray-200 print:border-none print:shadow-none print:max-w-none">
                                    {/* Report Header */}
                                    <div className="flex justify-between items-start border-b-2 border-gray-800 pb-4 mb-6 print:mb-4">
                                        <div>
                                            <h1 className="text-3xl font-extrabold text-gray-900 uppercase tracking-tight">Statement of Accounts</h1>
                                            <p className="text-gray-600 mt-1 text-lg font-medium">Period: {months[reportData.month]} {reportData.year}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xl font-bold text-blue-700">CommunityCircle</p>
                                            <p className="text-xs text-gray-500">Generated: {reportData.generatedAt}</p>
                                        </div>
                                    </div>

                                    {/* SECTION 1: Cash Flow Statement (Formal) */}
                                    <div className="section-container">
                                        <h2 className="section-title">Cash Flow Summary</h2>
                                        <div className="px-2">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-gray-600 font-medium">Opening Balance</span>
                                                <span className="text-gray-900 font-mono font-bold">${reportData.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div className="flex justify-between items-center mb-1 text-sm pl-4 border-l-2 border-gray-300">
                                                <span className="text-gray-500">Total Savings Collected</span>
                                                <span className="text-green-700 font-mono">+ ${reportData.totalSavings.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div className="flex justify-between items-center mb-1 text-sm pl-4 border-l-2 border-gray-300">
                                                <span className="text-gray-500">Late Fees Collected</span>
                                                <span className="text-green-700 font-mono">+ ${reportData.totalLateFees.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div className="flex justify-between items-center mb-2 text-sm pl-4 border-l-2 border-gray-300">
                                                <span className="text-gray-500">Loan Repayments Received</span>
                                                <span className="text-green-700 font-mono">+ ${reportData.totalRepaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div className="flex justify-between items-center mb-1 text-sm pl-4 border-l-2 border-gray-300">
                                                <span className="text-gray-500">Less: Loans Disbursed</span>
                                                <span className="text-red-700 font-mono">- ${reportData.totalDisbursed.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div className="flex justify-between items-center mb-4 text-sm pl-4 border-l-2 border-gray-300">
                                                <span className="text-gray-500">Less: Member Refunds</span>
                                                <span className="text-red-700 font-mono">- ${reportData.totalWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div className="flex justify-between items-center pt-3 border-t border-gray-800">
                                                <span className="text-lg font-bold text-gray-900">Closing Balance</span>
                                                <span className="text-xl font-bold text-blue-700 font-mono">${reportData.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* SECTION 2: Member Contributions Table */}
                                    <div className="section-container">
                                        <div className="flex justify-between items-center border-b border-gray-200 mb-2 pb-1">
                                            <h2 className="section-title mb-0 border-none">Member Contributions</h2>
                                            <span className="text-sm font-bold text-gray-600">Total: ${(reportData.totalSavings + reportData.totalLateFees).toLocaleString()}</span>
                                        </div>
                                        {reportData.savingsList.length === 0 ? (
                                            <p className="text-sm text-gray-400 italic">No contributions this month.</p>
                                        ) : (
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-100 text-gray-600 font-semibold uppercase text-xs">
                                                    <tr>
                                                        <th className="py-2 text-left">Member Name</th>
                                                        <th className="py-2 text-right">Savings</th>
                                                        <th className="py-2 text-right">Late Fees</th>
                                                        <th className="py-2 text-right">Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200">
                                                    {reportData.savingsList.map((row, idx) => (
                                                        <tr key={idx}>
                                                            <td className="py-1.5 text-gray-800">{row.name}</td>
                                                            <td className="py-1.5 text-right text-gray-600">${row.amount}</td>
                                                            <td className="py-1.5 text-right text-red-500">{row.lateFee > 0 ? `$${row.lateFee}` : '-'}</td>
                                                            <td className="py-1.5 text-right font-medium text-gray-900">${row.total}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                        {/* SECTION 4: Loans Disbursed */}
                                        <div className="section-container mb-0">
                                            <h2 className="section-title">Loans Issued</h2>
                                            {reportData.disbursements.length === 0 ? (
                                                <p className="text-sm text-gray-400 italic">No loans issued.</p>
                                            ) : (
                                                <table className="w-full text-sm">
                                                    <thead className="bg-gray-100 text-gray-600 font-semibold uppercase text-xs">
                                                        <tr>
                                                            <th className="py-1 text-left">Date</th>
                                                            <th className="py-1 text-left">Member</th>
                                                            <th className="py-1 text-right">Amount</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200">
                                                        {reportData.disbursements.map((d, idx) => (
                                                            <tr key={idx}>
                                                                <td className="py-1 text-gray-500 text-xs">{d.date.slice(0, -5)}</td>
                                                                <td className="py-1 text-gray-800">{d.member}</td>
                                                                <td className="py-1 text-right font-bold text-red-600">-${d.amount}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>

                                        {/* SECTION 5: Repayments */}
                                        <div className="section-container mb-0">
                                            <h2 className="section-title">Repayments</h2>
                                            {reportData.repayments.length === 0 ? (
                                                <p className="text-sm text-gray-400 italic">No repayments received.</p>
                                            ) : (
                                                <table className="w-full text-sm">
                                                    <thead className="bg-gray-100 text-gray-600 font-semibold uppercase text-xs">
                                                        <tr>
                                                            <th className="py-1 text-left">Date</th>
                                                            <th className="py-1 text-left">Member</th>
                                                            <th className="py-1 text-right">Amount</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200">
                                                        {reportData.repayments.map((r, idx) => (
                                                            <tr key={idx}>
                                                                <td className="py-1 text-gray-500 text-xs">{r.date.slice(0, -5)}</td>
                                                                <td className="py-1 text-gray-800">{r.member}</td>
                                                                <td className="py-1 text-right font-bold text-green-600">+${r.amount}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    </div>

                                    {/* SECTION 6: Outstanding Loans Assets Snapshot */}
                                    <div className="section-container">
                                        <div className="flex justify-between items-center border-b border-gray-200 mb-2 pb-1">
                                            <h2 className="section-title mb-0 border-none">Outstanding Loans (Receivables)</h2>
                                            <span className="text-sm font-bold text-gray-900">Total: ${reportData.totalOutstandingPrincipal.toLocaleString()}</span>
                                        </div>

                                        {reportData.outstandingLoans.length === 0 ? (
                                            <p className="text-sm text-green-600 italic font-medium">No outstanding loans! All debts cleared.</p>
                                        ) : (
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                {reportData.outstandingLoans.map((loan, idx) => (
                                                    <div key={idx} className="border border-gray-200 p-2 rounded flex justify-between items-center">
                                                        <div>
                                                            <p className="text-xs font-bold text-gray-800">{loan.member}</p>
                                                            <p className="text-[10px] text-gray-500">Loan: ${loan.originalAmount}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-xs font-bold text-red-600">${loan.balance}</p>
                                                            <p className="text-[10px] text-gray-400">Balance</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* SECTION 3: Withdrawals (Moved to Bottom as Requested) */}
                                    {reportData.withdrawals.length > 0 && (
                                        <div className="section-container">
                                            <h2 className="section-title">Member Withdrawals / Refunds</h2>
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-100 text-gray-600 font-semibold uppercase text-xs">
                                                    <tr>
                                                        <th className="py-1 text-left">Date</th>
                                                        <th className="py-1 text-left">Member Name</th>
                                                        <th className="py-1 text-right">Refund Amount</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200">
                                                    {reportData.withdrawals.map((w, idx) => (
                                                        <tr key={idx}>
                                                            <td className="py-1 text-gray-500 text-xs">{w.date.slice(0, -5)}</td>
                                                            <td className="py-1 text-gray-800">{w.member}</td>
                                                            <td className="py-1 text-right font-bold text-red-600">-${w.total.toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* Footer */}
                                    <div className="mt-8 pt-6 border-t border-gray-300 flex justify-between items-end text-xs text-gray-500 break-inside-avoid">
                                        <div className="space-y-1">
                                            <p>Verified by Treasurer:</p>
                                            <div className="h-8 border-b border-gray-300 w-48"></div>
                                        </div>
                                        <div className="space-y-1 text-right">
                                            <p>Verified by Admin:</p>
                                            <div className="h-8 border-b border-gray-300 w-48"></div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer for navigation */}
                        {reportData && (
                            <div className="p-4 border-t bg-gray-50 flex justify-between items-center print:hidden">
                                <button
                                    onClick={() => setReportData(null)}
                                    className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
                                >
                                    &larr; Back to selection
                                </button>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleShare}
                                        disabled={isSharing}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <Share2 size={18} /> {isSharing ? 'Generating...' : 'Share PDF'}
                                    </button>
                                    <button
                                        onClick={handlePrint}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2"
                                    >
                                        <Printer size={18} /> Print
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
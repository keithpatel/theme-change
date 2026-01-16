import { useState, FormEvent } from 'react';
// @ts-ignore
import { signInWithEmailAndPassword, signOut, signInAnonymously } from 'firebase/auth';
// @ts-ignore
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../App';
import { Shield, User, AlertCircle, KeyRound } from 'lucide-react';
import { Member } from '../types';

const Login = () => {
  // Changed default state to 'member'
  const [activeTab, setActiveTab] = useState<'admin' | 'member'>('member');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [uniqueId, setUniqueId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { loginAdmin, loginMember } = useAuth();

  const handleAdminLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      loginAdmin(userCredential.user.email || '');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError("Invalid email or password.");
      } else if (err.code === 'auth/network-request-failed') {
        setError("Network error. If deploying, check Firebase 'Authorized Domains'.");
      } else {
        setError(err.message || "Login failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMemberLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Basic client-side validation
    if (uniqueId.length !== 5) {
      setError("Member ID must be 5 digits.");
      setLoading(false);
      return;
    }

    try {
      // 0. Ensure we are signed out before starting a member session
      await signOut(auth);

      let authSuccess = false;
      let authError = null;

      // 1. Try to sign in anonymously
      try {
        await signInAnonymously(auth);
        authSuccess = true;
      } catch (err: any) {
        console.warn("Anonymous auth failed, attempting public query...", err);
        authError = err;
        // We continue execution here. If the database rules are public (insecure), 
        // the query below will still work even if auth failed.
      }

      // 2. Query Firestore
      const q = query(collection(db, "members"), where("uniqueId", "==", uniqueId));

      try {
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const memberDoc = querySnapshot.docs[0];
          const memberData = { id: memberDoc.id, ...memberDoc.data() } as Member;
          loginMember(memberData);
        } else {
          // Clean up if ID invalid
          if (authSuccess) await signOut(auth);
          setError("Invalid Member ID. Please check your 5-digit code.");
        }
      } catch (queryErr: any) {
        // If the query failed AND we had an auth error earlier, the auth error is likely the root cause
        // (i.e., Database Rules blocked the unauthenticated request)
        if (!authSuccess && authError) {
          throw authError;
        }
        // Otherwise, it's a genuine permission issue or network error
        throw queryErr;
      }

    } catch (err: any) {
      // Ensure clean state
      await signOut(auth);
      console.error("Login Error:", err);

      // Detailed instructions for the user based on the specific error code
      if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/admin-restricted-operation') {
        setError("Login Failed: Anonymous auth disabled. Go to Firebase Console > Authentication > Sign-in method > Enable Anonymous.");
      } else if (err.code === 'permission-denied') {
        setError("Access Denied: Update Firestore Rules to 'allow read, write: if request.auth != null;'");
      } else if (err.code === 'auth/network-request-failed') {
        setError("Network Error: If testing on mobile/local, ensure your IP/Domain is in Firebase Console > Auth > Settings > Authorized Domains.");
      } else {
        setError(`Login failed: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="p-8 text-center bg-blue-600">
          <h1 className="text-3xl font-bold text-white mb-2">CommunityCircle</h1>
          <p className="text-blue-100">Savings & Loan Management</p>
        </div>

        <div className="flex border-b">
          <button
            onClick={() => { setActiveTab('member'); setError(null); }}
            className={`flex-1 py-4 font-medium text-sm focus:outline-none transition-colors ${activeTab === 'member'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            <div className="flex items-center justify-center gap-2">
              <User size={18} />
              Member Login
            </div>
          </button>
          <button
            onClick={() => { setActiveTab('admin'); setError(null); }}
            className={`flex-1 py-4 font-medium text-sm focus:outline-none transition-colors ${activeTab === 'admin'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Shield size={18} />
              Admin Portal
            </div>
          </button>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span className="text-left font-medium">{error}</span>
            </div>
          )}

          {activeTab === 'admin' ? (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="admin@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 flex justify-center items-center"
              >
                {loading ? 'Logging in...' : 'Sign In as Admin'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleMemberLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">5-Digit Member ID</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-2.5 text-gray-400" size={20} />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    maxLength={5}
                    value={uniqueId}
                    onChange={(e) => setUniqueId(e.target.value.replace(/\D/g, ''))}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all tracking-widest text-lg"
                    placeholder="12345"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1 ml-1">Enter the ID provided by your admin.</p>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Checking ID...' : 'Access Portal'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
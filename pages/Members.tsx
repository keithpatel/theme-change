import { useState, useEffect, FormEvent, MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
// @ts-ignore
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Member, UserRole } from '../types';
import { useAuth } from '../App';
import { Plus, Search, Edit2, Trash2, X, Save, Phone, MapPin, Hash, AlertTriangle, Eye } from 'lucide-react';

const Members = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdminView = role === UserRole.ADMIN_VIEW;
  const [members, setMembers] = useState<Member[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState(location.state?.searchQuery || '');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  // Delete Confirmation Modal State
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, memberId: string | null, memberName: string }>({
    isOpen: false,
    memberId: null,
    memberName: ''
  });

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    uniqueId: ''
  });

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

      // Sort members alphabetically by name
      membersList.sort((a, b) => a.name.localeCompare(b.name));

      setMembers(membersList);
    } catch (error) {
      console.error("Error fetching members: ", error);
    }
  };

  const generateUniqueId = () => {
    let result = '';
    const characters = '0123456789';
    for (let i = 0; i < 5; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  };

  const handleOpenModal = (member?: Member) => {
    if (member) {
      setEditingMember(member);
      setFormData({
        name: member.name,
        phone: member.phone,
        address: member.address || '',
        uniqueId: member.uniqueId
      });
    } else {
      setEditingMember(null);
      setFormData({
        name: '',
        phone: '',
        address: '',
        uniqueId: generateUniqueId()
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (editingMember) {
        const memberRef = doc(db, 'members', editingMember.id);
        await updateDoc(memberRef, {
          name: formData.name,
          phone: formData.phone,
          address: formData.address,
        });
      } else {
        await addDoc(collection(db, 'members'), {
          ...formData,
          joinedDate: new Date().toISOString(),
          payments: {}
        });
      }
      setIsModalOpen(false);
      fetchMembers();
    } catch (error: any) {
      console.error("Error saving member: ", error);
      alert("Failed to save member. Error: " + (error.message || "Unknown error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const initiateDelete = (member: Member, e: MouseEvent) => {
    e.stopPropagation();
    setDeleteModal({
      isOpen: true,
      memberId: member.id,
      memberName: member.name
    });
  };

  const confirmDelete = async () => {
    if (!deleteModal.memberId) return;

    try {
      await deleteDoc(doc(db, 'members', deleteModal.memberId));
      setMembers(prev => prev.filter(member => member.id !== deleteModal.memberId));
      setDeleteModal({ isOpen: false, memberId: null, memberName: '' });
    } catch (error) {
      console.error("Error deleting member: ", error);
      alert("Failed to delete member. Please check your internet connection.");
    }
  };

  const filteredMembers = members.filter(m =>
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.uniqueId.includes(searchTerm)
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Member Management</h2>
        {!isAdminView && (
          <button
            onClick={() => handleOpenModal()}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            <Plus size={20} />
            Add Member
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search members..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-colors"
            />
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600 text-sm font-semibold uppercase">
              <tr>
                <th className="px-6 py-4">Unique ID</th>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Phone</th>
                <th className="px-6 py-4">Address</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredMembers.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-mono text-blue-600 font-medium">{member.uniqueId}</td>
                  <td className="px-6 py-4 font-medium text-gray-900">{member.name}</td>
                  <td className="px-6 py-4 text-gray-500">{member.phone}</td>
                  <td className="px-6 py-4 text-gray-500 truncate max-w-xs">{member.address || '-'}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/members/${member.id}`)}
                        className="text-gray-600 hover:text-blue-600 p-2 rounded-full hover:bg-blue-50 transition-colors"
                        title="View Profile"
                      >
                        <Eye size={18} />
                      </button>
                      {!isAdminView && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOpenModal(member)}
                            className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50 transition-colors"
                            title="Edit Member"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => initiateDelete(member, e)}
                            className="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-50 transition-colors cursor-pointer"
                            title="Delete Member"
                          >
                            <Trash2 size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-gray-100">
          {filteredMembers.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No members found.
            </div>
          ) : (
            filteredMembers.map(member => (
              <div key={member.id} className="p-4 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">{member.name}</h3>
                    <div className="flex items-center gap-1 text-blue-600 font-mono text-sm mt-0.5">
                      <Hash size={12} />
                      {member.uniqueId}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => navigate(`/members/${member.id}`)}
                      className="p-2 text-gray-600 bg-gray-50 rounded-full"
                    >
                      <Eye size={16} />
                    </button>
                    {!isAdminView && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenModal(member)}
                          className="p-2 text-blue-600 bg-blue-50 rounded-full"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => initiateDelete(member, e)}
                          className="p-2 text-red-500 bg-red-50 rounded-full cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Phone size={14} className="text-gray-400" />
                    <a href={`tel:${member.phone}`} className="hover:underline hover:text-blue-600">{member.phone}</a>
                  </div>
                  {member.address && (
                    <div className="flex items-start gap-2">
                      <MapPin size={14} className="text-gray-400 mt-0.5" />
                      <span>{member.address}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => navigate(`/members/${member.id}`)}
                  className="w-full mt-2 py-2 text-sm font-medium text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  View Full Profile
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Edit/Add Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b flex justify-between items-center bg-gray-50 sticky top-0 z-10">
              <h3 className="text-lg font-bold text-gray-800">
                {editingMember ? 'Edit Member' : 'Add New Member'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unique ID</label>
                  <input
                    type="text"
                    readOnly={!editingMember}
                    value={formData.uniqueId}
                    className="w-full px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-lg text-gray-500 font-mono tracking-wider cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="(555) 123-4567"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address (Optional)</label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    rows={3}
                    placeholder="123 Main St..."
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-4 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-2 transition-colors font-medium shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={18} />
                        Save
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60] animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="text-red-600" size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Member?</h3>
            <p className="text-gray-500 text-sm mb-6">
              Are you sure you want to remove <span className="font-semibold text-gray-800">{deleteModal.memberName}</span>? This action cannot be undone and all data will be lost.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModal({ isOpen: false, memberId: null, memberName: '' })}
                className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium shadow-sm"
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

export default Members;
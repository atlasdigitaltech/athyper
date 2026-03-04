"use client";

import { useState, useEffect } from "react";

/**
 * Retention Action Type
 */
type RetentionAction = 'archive' | 'hard_delete' | 'keep';

/**
 * Retention Policy Type
 */
interface RetentionPolicy {
  id: string;
  tenantId: string;
  policyName: string;
  entityType?: string;
  retentionDays: number;
  action: RetentionAction;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Archived Comment Type
 */
interface ArchivedComment {
  id: string;
  commentText: string;
  commenterId: string;
  commenterDisplayName?: string;
  entityType: string;
  entityId: string;
  archivedAt: string;
  archivedBy: string;
  retentionUntil?: string;
  policyId?: string;
}

/**
 * Comment Retention Manager Props
 */
interface CommentRetentionManagerProps {
  tenantId?: string;
}

/**
 * Comment Retention Manager Component
 *
 * Manage retention policies and view archived comments.
 */
export function CommentRetentionManager({ tenantId }: CommentRetentionManagerProps) {
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [archivedComments, setArchivedComments] = useState<ArchivedComment[]>([]);
  const [activeTab, setActiveTab] = useState<'policies' | 'archived'>('policies');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    policyName: '',
    entityType: '',
    retentionDays: 365,
    action: 'archive' as RetentionAction,
  });

  const fetchPolicies = async () => {
    try {
      const res = await fetch('/api/collab/retention/policies', {
        credentials: 'same-origin',
      });

      if (!res.ok) {
        throw new Error('Failed to fetch policies');
      }

      const data = await res.json();
      setPolicies(data.data || []);
    } catch (err) {
      console.error('Error fetching policies:', err);
      setError(err instanceof Error ? err.message : 'Failed to load policies');
    }
  };

  const fetchArchivedComments = async () => {
    try {
      const res = await fetch('/api/collab/retention/archived?limit=50', {
        credentials: 'same-origin',
      });

      if (!res.ok) {
        throw new Error('Failed to fetch archived comments');
      }

      const data = await res.json();
      setArchivedComments(data.data || []);
    } catch (err) {
      console.error('Error fetching archived comments:', err);
      setError(err instanceof Error ? err.message : 'Failed to load archived comments');
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        if (activeTab === 'policies') {
          await fetchPolicies();
        } else {
          await fetchArchivedComments();
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [activeTab]);

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const res = await fetch('/api/collab/retention/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error('Failed to create policy');
      }

      setShowCreateForm(false);
      setFormData({
        policyName: '',
        entityType: '',
        retentionDays: 365,
        action: 'archive',
      });
      await fetchPolicies();
    } catch (err) {
      console.error('Error creating policy:', err);
      alert('Failed to create retention policy');
    }
  };

  const handleTogglePolicy = async (policyId: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/collab/retention/policies/${policyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ enabled }),
      });

      if (!res.ok) {
        throw new Error('Failed to update policy');
      }

      await fetchPolicies();
    } catch (err) {
      console.error('Error updating policy:', err);
      alert('Failed to update retention policy');
    }
  };

  const handleDeletePolicy = async (policyId: string) => {
    if (!confirm('Are you sure you want to delete this retention policy?')) {
      return;
    }

    try {
      const res = await fetch(`/api/collab/retention/policies/${policyId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });

      if (!res.ok) {
        throw new Error('Failed to delete policy');
      }

      await fetchPolicies();
    } catch (err) {
      console.error('Error deleting policy:', err);
      alert('Failed to delete retention policy');
    }
  };

  const handleRestoreComment = async (commentId: string) => {
    if (!confirm('Are you sure you want to restore this archived comment?')) {
      return;
    }

    try {
      const res = await fetch(`/api/collab/retention/archived/${commentId}/restore`, {
        method: 'POST',
        credentials: 'same-origin',
      });

      if (!res.ok) {
        throw new Error('Failed to restore comment');
      }

      await fetchArchivedComments();
    } catch (err) {
      console.error('Error restoring comment:', err);
      alert('Failed to restore comment');
    }
  };

  const actionLabels: Record<RetentionAction, { label: string; color: string }> = {
    archive: { label: 'Archive (Soft Delete)', color: 'bg-yellow-100 text-yellow-800' },
    hard_delete: { label: 'Hard Delete (Permanent)', color: 'bg-red-100 text-red-800' },
    keep: { label: 'Keep Forever', color: 'bg-green-100 text-green-800' },
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-pulse text-gray-500">Loading retention data...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Comment Retention Management</h1>
        <p className="text-sm text-gray-600">
          Configure automated retention policies and manage archived comments
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab('policies')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'policies'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Retention Policies
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('archived')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'archived'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Archived Comments ({archivedComments.length})
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
          ⚠️ {error}
        </div>
      )}

      {/* Policies Tab */}
      {activeTab === 'policies' && (
        <div className="space-y-6">
          {/* Create Policy Button */}
          {!showCreateForm && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                + Create New Policy
              </button>
            </div>
          )}

          {/* Create Policy Form */}
          {showCreateForm && (
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Retention Policy</h3>
              <form onSubmit={handleCreatePolicy} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Policy Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.policyName}
                    onChange={(e) => setFormData({ ...formData, policyName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Archive old comments after 1 year"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Entity Type (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.entityType}
                    onChange={(e) => setFormData({ ...formData, entityType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Leave empty to apply to all entity types"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Specify an entity type to limit this policy (e.g., "task", "document")
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Retention Period (Days) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.retentionDays}
                    onChange={(e) => setFormData({ ...formData, retentionDays: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Comments older than this will be processed according to the action below
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Action *
                  </label>
                  <select
                    required
                    value={formData.action}
                    onChange={(e) => setFormData({ ...formData, action: e.target.value as RetentionAction })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="archive">Archive (Soft Delete - Can be restored)</option>
                    <option value="hard_delete">Hard Delete (Permanent - Cannot be restored)</option>
                    <option value="keep">Keep Forever (No expiration)</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                  >
                    Create Policy
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Policies List */}
          <div className="space-y-3">
            {policies.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-600">No retention policies configured</p>
              </div>
            ) : (
              policies.map((policy) => (
                <div
                  key={policy.id}
                  className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {policy.policyName}
                        </h3>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${actionLabels[policy.action].color}`}>
                          {actionLabels[policy.action].label}
                        </span>
                        {!policy.enabled && (
                          <span className="px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-600 rounded-full">
                            Disabled
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Entity Type:</span>{' '}
                          <span className="font-medium text-gray-900">
                            {policy.entityType || 'All types'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Retention Period:</span>{' '}
                          <span className="font-medium text-gray-900">
                            {policy.retentionDays} days
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Created:</span>{' '}
                          <span className="font-medium text-gray-900">
                            {new Date(policy.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Updated:</span>{' '}
                          <span className="font-medium text-gray-900">
                            {new Date(policy.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 ml-4">
                      <button
                        type="button"
                        onClick={() => handleTogglePolicy(policy.id, !policy.enabled)}
                        className={`px-3 py-1 text-xs font-medium rounded-lg ${
                          policy.enabled
                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                      >
                        {policy.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePolicy(policy.id)}
                        className="px-3 py-1 text-xs font-medium text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Archived Comments Tab */}
      {activeTab === 'archived' && (
        <div className="space-y-3">
          {archivedComments.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <p className="text-gray-600">No archived comments</p>
            </div>
          ) : (
            archivedComments.map((comment) => (
              <div
                key={comment.id}
                className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-600">
                        {(comment.commenterDisplayName || comment.commenterId).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {comment.commenterDisplayName || comment.commenterId}
                      </div>
                      <div className="text-xs text-gray-500">
                        Archived on {new Date(comment.archivedAt).toLocaleString()} by {comment.archivedBy}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestoreComment(comment.id)}
                    className="px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    Restore
                  </button>
                </div>

                <div className="text-sm text-gray-700 mb-2 line-clamp-3">
                  {comment.commentText}
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>{comment.entityType}</span>
                  {comment.retentionUntil && (
                    <span>
                      Expires: {new Date(comment.retentionUntil).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

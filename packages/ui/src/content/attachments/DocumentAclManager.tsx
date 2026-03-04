/**
 * DocumentAclManager Component
 *
 * UI for managing per-document access control lists.
 * Allows granting and revoking permissions for specific users/roles.
 */

"use client";

import { useState, useEffect } from "react";

export interface DocumentAcl {
  id: string;
  attachmentId: string;
  principalId: string | null;
  roleId: string | null;
  permission: "read" | "download" | "delete" | "share";
  granted: boolean;
  grantedBy: string;
  grantedAt: string;
  expiresAt: string | null;
}

export interface DocumentAclManagerProps {
  attachmentId: string;
  readonly?: boolean;
}

export function DocumentAclManager({ attachmentId, readonly = false }: DocumentAclManagerProps) {
  const [acls, setAcls] = useState<DocumentAcl[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGrantForm, setShowGrantForm] = useState(false);

  /**
   * Fetch ACL entries
   */
  useEffect(() => {
    fetchAcls();
  }, [attachmentId]);

  const fetchAcls = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch(`/api/content/acl/${attachmentId}`, {
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to load ACLs");
      }

      setAcls(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Grant permission
   */
  const handleGrant = async (principalId: string, permission: string) => {
    try {
      setError(null);

      const res = await fetch("/api/content/acl/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attachmentId,
          principalId,
          permission,
          granted: true,
        }),
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Grant failed");
      }

      fetchAcls();
      setShowGrantForm(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  /**
   * Revoke permissions for principal
   */
  const handleRevoke = async (principalId: string) => {
    try {
      setError(null);

      const res = await fetch("/api/content/acl/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attachmentId,
          principalId,
        }),
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Revoke failed");
      }

      fetchAcls();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return <div className="text-center py-8 text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Access Control</h3>
        {!readonly && (
          <button
            onClick={() => setShowGrantForm(!showGrantForm)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
          >
            {showGrantForm ? "Cancel" : "Grant Permission"}
          </button>
        )}
      </div>

      {/* Grant form */}
      {showGrantForm && !readonly && (
        <div className="border rounded-lg p-4 bg-gray-50">
          <p className="text-sm text-gray-600 mb-2">
            Grant permission form (simplified - would need user/role picker in production)
          </p>
          <div className="text-xs text-gray-500">
            TODO: Add user/role selector and permission dropdown
          </div>
        </div>
      )}

      {/* ACL list */}
      {acls.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No custom permissions set. Default permissions apply.
        </div>
      ) : (
        <div className="space-y-2">
          {acls.map((acl) => (
            <div
              key={acl.id}
              className="flex items-center justify-between p-3 border rounded-lg bg-white"
            >
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {acl.principalId ? `User: ${acl.principalId}` : `Role: ${acl.roleId}`}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                  <span className="capitalize">{acl.permission}</span>
                  <span>•</span>
                  <span>{acl.granted ? "Granted" : "Denied"}</span>
                  {acl.expiresAt && (
                    <>
                      <span>•</span>
                      <span>Expires {new Date(acl.expiresAt).toLocaleDateString()}</span>
                    </>
                  )}
                </div>
              </div>

              {!readonly && acl.principalId && (
                <button
                  onClick={() => handleRevoke(acl.principalId!)}
                  className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

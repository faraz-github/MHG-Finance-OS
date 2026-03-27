'use client';
// src/app/(dashboard)/users/page.tsx
//
// User Management + Role Permissions panel — SuperAdmin only.
//
// Modals use platform classes: .ov.open / .modal / .mt / .ms / .mc-x / .mf / .mb
// Select uses .sw wrapper + .fs — consistent with every other page.
// Period bar hidden via PeriodBar HIDE_ON array (no work needed here).

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import styles from '@/components/ui/ui.module.css';
import type { TabKey, CrudAction } from '@/lib/permissions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserRow {
  id: string;
  username: string;
  role: { name: string };
  created_at: string;
}

interface RoleRow {
  id: string;
  name: string;
  tab_permissions: Record<TabKey, boolean>;
  crud_permissions: Record<TabKey, Record<CrudAction, boolean>>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_TAB_KEYS: TabKey[] = [
  'dashboard', 'cashflow', 'properties', 'investors', 'reports',
  'insights', 'expenses', 'payouts', 'bookings', 'crm',
  'dailyexp', 'monthlyentry', 'utils', 'users',
];

const TAB_LABELS: Record<TabKey, string> = {
  dashboard:    'Dashboard',
  cashflow:     'Cash Flow',
  properties:   'Properties',
  investors:    'Investors',
  reports:      'Reports',
  insights:     'Smart Insights',
  expenses:     'Expense Intel',
  payouts:      'Payout Ledger',
  bookings:     'Bookings',
  crm:          'Guest CRM',
  dailyexp:     'Daily Expenses',
  monthlyentry: 'Monthly Entry',
  utils:        'Rent & Utilities',
  users:        'User Management',
};

const CRUD_ACTIONS: CrudAction[] = ['read', 'create', 'update', 'delete'];

const CRUD_LABELS: Record<CrudAction, string> = {
  read: 'Read', create: 'Create', update: 'Update', delete: 'Delete',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UsersPage() {
  const { toast } = useToast();

  const [users,        setUsers]        = useState<UserRow[]>([]);
  const [roles,        setRoles]        = useState<RoleRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [fetchError,   setFetchError]   = useState<string | null>(null);

  // Create form
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRoleId,   setFormRoleId]   = useState('');
  const [formError,    setFormError]    = useState<string | null>(null);
  const [formSuccess,  setFormSuccess]  = useState<string | null>(null);
  const [formLoading,  setFormLoading]  = useState(false);

  // Change password modal
  const [pwdUserId,   setPwdUserId]   = useState<string | null>(null);
  const [pwdUsername, setPwdUsername] = useState('');
  const [pwdValue,    setPwdValue]    = useState('');
  const [pwdLoading,  setPwdLoading]  = useState(false);
  const [pwdError,    setPwdError]    = useState<string | null>(null);

  // Delete confirm modal
  const [deleteUserId,   setDeleteUserId]   = useState<string | null>(null);
  const [deleteUsername, setDeleteUsername] = useState('');
  const [deleteLoading,  setDeleteLoading]  = useState(false);

  // Permissions editor
  const [selectedRoleId,  setSelectedRoleId]  = useState('');
  const [editedTabPerms,  setEditedTabPerms]  = useState<Record<string, Record<TabKey, boolean>>>({});
  const [editedCrudPerms, setEditedCrudPerms] = useState<Record<string, Record<TabKey, Record<CrudAction, boolean>>>>({});
  const [dirtyRoles,      setDirtyRoles]      = useState<Set<string>>(new Set());
  const [savingRoleId,    setSavingRoleId]    = useState<string | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/auth/users');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      setFetchError('Failed to load user list.');
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const fetchRoles = useCallback(async () => {
    setLoadingRoles(true);
    try {
      const res = await fetch('/api/roles');
      if (!res.ok) throw new Error();
      const data = await res.json();
      const fetched: RoleRow[] = data.roles ?? [];
      setRoles(fetched);

      const firstNonSuper = fetched.find((r) => r.name !== 'SuperAdmin');
      if (firstNonSuper) {
        setFormRoleId(firstNonSuper.id);
        setSelectedRoleId(firstNonSuper.id);
      }

      const tabMap:  Record<string, Record<TabKey, boolean>> = {};
      const crudMap: Record<string, Record<TabKey, Record<CrudAction, boolean>>> = {};
      for (const r of fetched) {
        tabMap[r.id] = { ...r.tab_permissions };
        const crudCopy = {} as Record<TabKey, Record<CrudAction, boolean>>;
        for (const tk of ALL_TAB_KEYS) {
          crudCopy[tk] = r.crud_permissions[tk]
            ? { ...r.crud_permissions[tk] }
            : { create: false, read: false, update: false, delete: false };
        }
        crudMap[r.id] = crudCopy;
      }
      setEditedTabPerms(tabMap);
      setEditedCrudPerms(crudMap);
      setDirtyRoles(new Set());
    } catch {
      setFetchError('Failed to load roles.');
    } finally {
      setLoadingRoles(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); fetchRoles(); }, [fetchUsers, fetchRoles]);

  // ── Create user ───────────────────────────────────────────────────────────
  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setFormLoading(true);
    try {
      const res = await fetch('/api/auth/create-user', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formUsername.trim(),
          password: formPassword,
          roleId:   formRoleId,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? 'Failed to create user.'); return; }
      setFormSuccess(`User "${data.username}" created successfully.`);
      setFormUsername('');
      setFormPassword('');
      await fetchUsers();
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setFormLoading(false);
    }
  }

  // ── Change password ───────────────────────────────────────────────────────
  function openPwdModal(userId: string, username: string) {
    setPwdUserId(userId); setPwdUsername(username); setPwdValue(''); setPwdError(null);
  }
  function closePwdModal() {
    setPwdUserId(null); setPwdUsername(''); setPwdValue(''); setPwdError(null);
  }
  async function handleChangePassword() {
    if (!pwdUserId) return;
    if (pwdValue.length < 8) { setPwdError('Password must be at least 8 characters.'); return; }
    setPwdLoading(true); setPwdError(null);
    try {
      const res = await fetch(`/api/auth/users/${pwdUserId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwdValue }),
      });
      const data = await res.json();
      if (!res.ok) { setPwdError(data.error ?? 'Failed to change password.'); return; }
      toast(`✓ Password updated for "${pwdUsername}"`, 'ok');
      closePwdModal();
    } catch {
      setPwdError('Network error. Please try again.');
    } finally {
      setPwdLoading(false);
    }
  }

  // ── Delete user ───────────────────────────────────────────────────────────
  function openDeleteConfirm(userId: string, username: string) {
    setDeleteUserId(userId); setDeleteUsername(username);
  }
  function closeDeleteConfirm() {
    setDeleteUserId(null); setDeleteUsername('');
  }
  async function handleDeleteUser() {
    if (!deleteUserId) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/auth/users/${deleteUserId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { toast(data.error ?? 'Failed to delete user.', 'er'); return; }
      toast(`User "${deleteUsername}" deleted.`, 'ok');
      closeDeleteConfirm();
      await fetchUsers();
    } catch {
      toast('Network error. Please try again.', 'er');
    } finally {
      setDeleteLoading(false);
    }
  }

  // ── Permission toggles ────────────────────────────────────────────────────
  function handleTabToggle(roleId: string, tab: TabKey, checked: boolean) {
    setEditedTabPerms((prev) => ({ ...prev, [roleId]: { ...prev[roleId], [tab]: checked } }));
    if (!checked) {
      setEditedCrudPerms((prev) => ({
        ...prev,
        [roleId]: { ...prev[roleId], [tab]: { create: false, read: false, update: false, delete: false } },
      }));
    } else {
      setEditedCrudPerms((prev) => ({
        ...prev,
        [roleId]: { ...prev[roleId], [tab]: { ...prev[roleId][tab], read: true } },
      }));
    }
    setDirtyRoles((prev) => new Set(prev).add(roleId));
  }

  function handleCrudToggle(roleId: string, tab: TabKey, action: CrudAction, checked: boolean) {
    setEditedCrudPerms((prev) => ({
      ...prev,
      [roleId]: { ...prev[roleId], [tab]: { ...prev[roleId][tab], [action]: checked } },
    }));
    if (checked && !editedTabPerms[roleId]?.[tab]) {
      setEditedTabPerms((prev) => ({ ...prev, [roleId]: { ...prev[roleId], [tab]: true } }));
    }
    if (action === 'read' && !checked) {
      setEditedTabPerms((prev) => ({ ...prev, [roleId]: { ...prev[roleId], [tab]: false } }));
      setEditedCrudPerms((prev) => ({
        ...prev,
        [roleId]: { ...prev[roleId], [tab]: { create: false, read: false, update: false, delete: false } },
      }));
    }
    setDirtyRoles((prev) => new Set(prev).add(roleId));
  }

  async function handleSavePermissions(roleId: string) {
    const role = roles.find((r) => r.id === roleId);
    if (!role || role.name === 'SuperAdmin') return;
    setSavingRoleId(roleId);
    try {
      const res = await fetch('/api/roles', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:               roleId,
          tab_permissions:  editedTabPerms[roleId],
          crud_permissions: editedCrudPerms[roleId],
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast(d.error ?? 'Failed to save permissions', 'er');
        return;
      }
      toast(`✓ Permissions saved for "${role.name}"`, 'ok');
      setDirtyRoles((prev) => { const n = new Set(prev); n.delete(roleId); return n; });
    } catch {
      toast('Network error — please try again', 'er');
    } finally {
      setSavingRoleId(null);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedRole         = roles.find((r) => r.id === selectedRoleId);
  const isSuperAdminSelected = selectedRole?.name === 'SuperAdmin';
  const nonSuperAdminRoles   = roles.filter((r) => r.name !== 'SuperAdmin');
  const superAdminRole       = roles.find((r) => r.name === 'SuperAdmin');

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── System Administration banner ─────────────────────────────────── */}
      <div style={{
        background: 'var(--orp)', border: '1.5px solid var(--or)',
        borderRadius: 'var(--r)', padding: '10px 16px',
        marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <span style={{ fontSize: '16px' }}>⚙</span>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--or)' }}>
            System Administration
          </div>
          <div style={{ fontSize: '11px', color: 'var(--t2)', marginTop: '1px' }}>
            SuperAdmin only · Changes here affect platform access for all users
          </div>
        </div>
      </div>

      {fetchError && (
        <div style={{
          background: 'var(--rdp)', border: '1px solid var(--rd)',
          borderRadius: '8px', padding: '10px 14px',
          fontSize: '13px', color: 'var(--rd)', marginBottom: '16px',
        }}>
          {fetchError}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1 — Create New User                                         */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="stl"><div className="d" />Create New User</div>

      <div className="cc" style={{ marginBottom: '20px', padding: '16px' }}>
        <form onSubmit={handleCreateUser} noValidate className="rg4" style={{ alignItems: 'stretch' }}>

          <div className={styles.fl}>
            <label>Username</label>
            <input
              className={styles.fi}
              type="text"
              placeholder="e.g. john.doe"
              value={formUsername}
              onChange={(e) => setFormUsername(e.target.value)}
              disabled={formLoading}
              required
            />
          </div>

          <div className={styles.fl}>
            <label>Password</label>
            <input
              className={styles.fi}
              type="password"
              placeholder="Min. 8 characters"
              value={formPassword}
              onChange={(e) => setFormPassword(e.target.value)}
              disabled={formLoading}
              required
            />
          </div>

          {/* Role — .sw wrapper provides chevron via CSS ::after, no JS needed */}
          <div className={styles.fl}>
            <label>Role</label>
            <div className={styles.sw}>
              <select
                className={styles.fs}
                value={formRoleId}
                onChange={(e) => setFormRoleId(e.target.value)}
                disabled={formLoading || loadingRoles}
              >
                {roles
                  .filter((r) => r.name !== 'SuperAdmin')
                  .map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>

          <div className={styles.fl}>
            <label>&nbsp;</label>
            <button
              type="submit"
              className="btn btn-or"
              disabled={formLoading || !formUsername.trim() || !formPassword}
              style={{ width: '100%', whiteSpace: 'nowrap', flex: 1 }}
            >
              {formLoading ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>

        {formError && (
          <div style={{
            marginTop: '12px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px',
            background: 'var(--rdp)', border: '1px solid var(--rd)', color: 'var(--rd)',
          }}>
            {formError}
          </div>
        )}
        {formSuccess && (
          <div style={{
            marginTop: '12px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px',
            background: 'var(--grp)', border: '1px solid var(--gr)', color: 'var(--gr)',
          }}>
            {formSuccess}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2 — All Users                                               */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="stl"><div className="d" />All Users</div>

      <div className="tw">
        {loadingUsers ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--t3)', fontSize: '13px' }}>
            Loading users…
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--t3)', fontSize: '13px' }}>
            No users found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: '500px' }}>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSuperAdmin = u.role.name === 'SuperAdmin';
                  const isAdmin      = u.role.name === 'Admin';
                  return (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>{u.username}</td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center',
                          padding: '3px 10px', borderRadius: '20px',
                          fontSize: '11px', fontWeight: 600,
                          background: isSuperAdmin ? 'var(--orp)' : isAdmin ? 'rgba(99,102,241,.1)' : 'var(--s2)',
                          color:      isSuperAdmin ? 'var(--or)'  : isAdmin ? '#6366F1'             : 'var(--t2)',
                          border: `1px solid ${isSuperAdmin ? 'var(--or)' : isAdmin ? 'rgba(99,102,241,.25)' : 'var(--bdr)'}`,
                        }}>
                          {isSuperAdmin && '⚙ '}{u.role.name}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--t2)' }}>
                        {new Date(u.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {!isSuperAdmin && (
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              className="btn btn-g btn-sm"
                              onClick={() => openPwdModal(u.id, u.username)}
                            >
                              🔑 Password
                            </button>
                            <button
                              className="btn btn-sm"
                              style={{
                                background: 'var(--rdp)',
                                color: 'var(--rd)',
                                border: '1px solid var(--rd)',
                              }}
                              onClick={() => openDeleteConfirm(u.id, u.username)}
                            >
                              🗑 Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 3 — Role Permissions                                        */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="stl" style={{ marginTop: '8px' }}><div className="d" />Role Permissions</div>

      <div className="cc" style={{ padding: '16px', marginBottom: '16px' }}>
        {loadingRoles ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--t3)', fontSize: '13px' }}>
            Loading roles…
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {superAdminRole && (
                <button
                  className={`btn ${selectedRoleId === superAdminRole.id ? 'btn-or' : 'btn-g'} btn-sm`}
                  onClick={() => setSelectedRoleId(superAdminRole.id)}
                >
                  ⚙ {superAdminRole.name}
                </button>
              )}
              {nonSuperAdminRoles.map((r) => (
                <button
                  key={r.id}
                  className={`btn ${selectedRoleId === r.id ? 'btn-or' : 'btn-g'} btn-sm`}
                  onClick={() => setSelectedRoleId(r.id)}
                >
                  {r.name}
                </button>
              ))}
            </div>

            {isSuperAdminSelected && (
              <div style={{
                background: 'var(--orp)', border: '1px solid var(--or)',
                borderRadius: '8px', padding: '8px 12px',
                fontSize: '12px', color: 'var(--or)', marginBottom: '12px',
              }}>
                SuperAdmin has full access to all tabs and actions. These permissions cannot be edited.
              </div>
            )}

            {selectedRoleId && editedTabPerms[selectedRoleId] && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  minWidth: '520px',
                  ...(isSuperAdminSelected ? { opacity: 0.5, pointerEvents: 'none' as const } : {}),
                }}>
                  <thead>
                    <tr>
                      <th>Tab</th>
                      <th style={{ textAlign: 'center' }}>Visible</th>
                      {CRUD_ACTIONS.map((a) => (
                        <th key={a} style={{ textAlign: 'center' }}>{CRUD_LABELS[a]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ALL_TAB_KEYS.map((tab) => {
                      const tabVisible = editedTabPerms[selectedRoleId]?.[tab] ?? false;
                      return (
                        <tr key={tab}>
                          <td style={{ fontWeight: 600, fontSize: '12.5px' }}>{TAB_LABELS[tab]}</td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={tabVisible}
                              onChange={(e) => handleTabToggle(selectedRoleId, tab, e.target.checked)}
                              style={{ accentColor: 'var(--or)' }}
                            />
                          </td>
                          {CRUD_ACTIONS.map((action) => (
                            <td key={action} style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={editedCrudPerms[selectedRoleId]?.[tab]?.[action] ?? false}
                                onChange={(e) => handleCrudToggle(selectedRoleId, tab, action, e.target.checked)}
                                style={{ accentColor: 'var(--or)' }}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {selectedRoleId && !isSuperAdminSelected && (
              <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  className="btn btn-or"
                  disabled={savingRoleId === selectedRoleId || !dirtyRoles.has(selectedRoleId)}
                  onClick={() => handleSavePermissions(selectedRoleId)}
                >
                  {savingRoleId === selectedRoleId ? 'Saving…' : 'Save Permissions'}
                </button>
                {!dirtyRoles.has(selectedRoleId) && (
                  <span style={{ fontSize: '11px', color: 'var(--t3)' }}>No unsaved changes</span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* CHANGE PASSWORD MODAL                                               */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div
        className={`${styles.ov}${pwdUserId ? ` ${styles.open}` : ''}`}
        onClick={closePwdModal}
      >
        <div
          className={styles.modal}
          onClick={(e) => e.stopPropagation()}
          style={{ width: '400px' }}
        >
          <button className={styles['mc-x']} onClick={closePwdModal}>✕</button>
          <div className={styles.mt}>Change Password</div>
          <div className={styles.ms}>
            Set a new password for <strong>{pwdUsername}</strong>.
          </div>

          <div className={styles.fl}>
            <label>New Password</label>
            <input
              className={styles.fi}
              type="password"
              placeholder="Min. 8 characters"
              value={pwdValue}
              onChange={(e) => setPwdValue(e.target.value)}
              disabled={pwdLoading}
              autoFocus
            />
          </div>

          {pwdError && (
            <div style={{
              marginBottom: '12px', padding: '8px 12px', borderRadius: '6px', fontSize: '12px',
              background: 'var(--rdp)', border: '1px solid var(--rd)', color: 'var(--rd)',
            }}>
              {pwdError}
            </div>
          )}

          <div className={styles.mf}>
            <button
              className={`${styles.mb} ${styles.can}`}
              onClick={closePwdModal}
              disabled={pwdLoading}
            >
              Cancel
            </button>
            <button
              className={`${styles.mb} ${styles.sub}`}
              onClick={handleChangePassword}
              disabled={pwdLoading || pwdValue.length < 8}
            >
              {pwdLoading ? 'Saving…' : 'Update Password'}
            </button>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* DELETE CONFIRM MODAL                                                */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div
        className={`${styles.ov}${deleteUserId ? ` ${styles.open}` : ''}`}
        onClick={closeDeleteConfirm}
      >
        <div
          className={styles.modal}
          onClick={(e) => e.stopPropagation()}
          style={{ width: '380px' }}
        >
          <button className={styles['mc-x']} onClick={closeDeleteConfirm}>✕</button>
          <div className={styles.mt}>Delete User</div>
          <div className={styles.ms}>This action cannot be undone.</div>

          <p style={{ fontSize: '13px', color: 'var(--t2)', marginBottom: '4px' }}>
            Are you sure you want to delete <strong>{deleteUsername}</strong>?
          </p>

          <div className={styles.mf}>
            <button
              className={`${styles.mb} ${styles.can}`}
              onClick={closeDeleteConfirm}
              disabled={deleteLoading}
            >
              Cancel
            </button>
            <button
              className={styles.mb}
              style={{ background: 'var(--rd)', color: '#fff' }}
              onClick={handleDeleteUser}
              disabled={deleteLoading}
            >
              {deleteLoading ? 'Deleting…' : 'Delete User'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
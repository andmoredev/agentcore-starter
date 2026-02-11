import { useState, useEffect, useRef } from 'react'
import { getUserId, setUserId, resetUserId, isCustomUserId } from '../services/userService'
import './UserMenu.css'

function UserMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const [userId, setUserIdState] = useState<string>(getUserId())
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState<string>('')
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setUserIdState(getUserId())
    
    // Listen for storage changes to update userId when changed elsewhere
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'chatbot_user_id' || (e.key === null && e.storageArea === localStorage)) {
        setUserIdState(getUserId())
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    
    // Also listen for custom event for same-tab updates
    const handleUserIdChange = () => {
      setUserIdState(getUserId())
    }
    
    window.addEventListener('userIdChanged', handleUserIdChange)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('userIdChanged', handleUserIdChange)
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setIsEditing(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleMenuToggle = () => {
    setIsOpen(!isOpen)
    if (!isOpen) {
      setIsEditing(false)
    }
  }

  const handleEditClick = () => {
    setIsEditing(true)
    setEditValue(userId)
  }

  const handleSave = () => {
    if (editValue.trim() !== '') {
      setUserId(editValue.trim())
      setUserIdState(editValue.trim())
    } else {
      resetUserId()
      setUserIdState(getUserId())
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditValue('')
  }

  const handleReset = () => {
    resetUserId()
    setUserIdState(getUserId())
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  const customUserId = isCustomUserId()

  return (
    <div className="user-menu-container" ref={menuRef}>
      <button
        className="user-menu-button"
        onClick={handleMenuToggle}
        aria-label="User menu"
        aria-expanded={isOpen}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>

      {isOpen && (
        <div className="user-menu-dropdown">
          <div className="user-menu-header">
            <span className="user-menu-label">User ID</span>
            {customUserId && (
              <button
                className="user-menu-reset"
                onClick={handleReset}
                aria-label="Reset to default"
                title="Reset to default"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}
          </div>

          {isEditing ? (
            <div className="user-menu-edit">
              <input
                ref={inputRef}
                type="text"
                className="user-menu-input"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter user ID"
              />
              <div className="user-menu-edit-actions">
                <button
                  className="user-menu-save"
                  onClick={handleSave}
                  aria-label="Save"
                >
                  Save
                </button>
                <button
                  className="user-menu-cancel"
                  onClick={handleCancel}
                  aria-label="Cancel"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="user-menu-content">
              <div className="user-menu-userid">{userId}</div>
              <button
                className="user-menu-edit-button"
                onClick={handleEditClick}
                aria-label="Edit user ID"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default UserMenu

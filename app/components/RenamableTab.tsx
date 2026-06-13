import { useEffect, useRef, useState } from "react";

interface RenamableTabProps {
  name: string;
  isActive: boolean;
  existingNames: string[];
  onRename: (name: string) => void;
  onClick: () => void;
  onClose: () => void;
  icon?: React.ReactNode;
  showClose?: boolean;
}

export default function RenamableTab({
  name,
  isActive,
  existingNames,
  onRename,
  onClick,
  onClose,
  icon,
  showClose = true,
}: RenamableTabProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setEditValue(name);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [editing]);

  const commit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== name && !existingNames.includes(trimmed)) {
      onRename(trimmed);
    }
    setEditing(false);
  };

  return (
    <div
      onClick={onClick}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className={`flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-sm border-r border-gray-800 shrink-0 transition-colors ${
        isActive
          ? "bg-[#16162a] text-white border-b-2 border-b-blue-500"
          : "text-gray-400 hover:text-white hover:bg-[#16162a]/50"
      }`}
    >
      {icon}
      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          className="bg-[#0d0d1a] text-white text-xs border border-gray-600 rounded px-1 py-0.5 w-20 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      ) : (
        <span className="truncate max-w-[80px]">{name}</span>
      )}
      {showClose && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="ml-0.5 p-0.5 rounded hover:bg-gray-600 text-gray-500 hover:text-gray-200 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

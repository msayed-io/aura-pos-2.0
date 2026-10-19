import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { SpinnerIcon, ShieldExclamationIcon } from '../Icons';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  isDeleting: boolean;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  isDeleting,
}) => {
  if (!isOpen) return null;

  const portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
    console.error("Modal root element #modal-root not found in the DOM.");
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 modal-backdrop-blur"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-md transform transition-all animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-neo-error/10 mb-4">
                <ShieldExclamationIcon className="h-10 w-10 text-neo-error" />
            </div>

            <h3 className="text-xl font-bold font-cairo text-neo-secondary">{title}</h3>
            <div className="mt-2">
                <p className="text-sm text-neo-secondary/60">{message}</p>
            </div>
        </div>
        <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 rounded-b-2xl">
          <button
            type="button"
            className="inline-flex w-full justify-center rounded-md bg-neo-error px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto disabled:opacity-50"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
                <>
                    <SpinnerIcon className="animate-spin h-5 w-5 mr-2" />
                    جاري الحذف...
                </>
            ) : (
                'نعم، قم بالحذف'
            )}
          </button>
          <button
            type="button"
            className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-neo-secondary shadow-sm ring-1 ring-inset ring-neo-soft-gray hover:bg-gray-50 sm:mt-0 sm:w-auto"
            onClick={onClose}
            disabled={isDeleting}
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>,
    portalRoot
  );
};

export default DeleteConfirmationModal;
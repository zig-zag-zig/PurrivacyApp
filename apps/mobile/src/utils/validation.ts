/**
 * Common validation utilities and form error handling
 */

import { PgpAlgorithm } from "../types/types";
import {
    KEY_COMMENT_MAX_LENGTH,
    KEY_EMAIL_MAX_LENGTH,
    KEY_NAME_MAX_LENGTH,
    PASSPHRASE_MAX_LENGTH,
    PASSPHRASE_MIN_LENGTH,
} from '../config/inputLimits';

interface ValidationResult {
    isValid: boolean;
    error?: string;
}

interface FormErrors {
    [key: string]: string;
}

/**
 * Email validation regex
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

const validateMaxLength = (value: string, fieldName: string, maxLength: number): ValidationResult => {
    if (value.length > maxLength) {
        return { isValid: false, error: `${fieldName} must be ${maxLength} characters or fewer` };
    }

    return { isValid: true };
};

const validateEmail = (email: string): ValidationResult => {
    if (email.trim() === '') {
        return { isValid: false, error: 'Email is required' };
    }

    if (!EMAIL_REGEX.test(email)) {
        return { isValid: false, error: 'Enter a valid email (e.g. user@domain.com)' };
    }

    return { isValid: true };
};

/**
 * Validates name and email field
 */
const validateUserId = (name: string, email: string, comment: string): ValidationResult => {
    if (name.trim() === '' && email.trim() === '' && comment.trim() === '') {
        return { isValid: false, error: 'Name, email, or comment is required' };
    }

    return { isValid: true };
};

/**
 * Validates passphrase with minimum length requirement
 */
export const validatePassphrase = (
    passphrase: string,
    minLength: number = PASSPHRASE_MIN_LENGTH,
    maxLength: number = PASSPHRASE_MAX_LENGTH,
): ValidationResult => {
    if (!passphrase) {
        return { isValid: true };
    }

    if (passphrase.length < minLength) {
        return { isValid: false, error: `Minimum ${minLength} characters` };
    }

    if (passphrase.length > maxLength) {
        return { isValid: false, error: `Maximum ${maxLength} characters` };
    }

    return { isValid: true };
};

/**
 * Validates password confirmation
 */
const validatePasswordConfirmation = (password: string, confirmPassword: string): ValidationResult => {
    if (password !== confirmPassword) {
        return { isValid: false, error: 'Passphrases must match' };
    }

    return { isValid: true };
};

/**
 * Validates content is not empty
 */
const validateRequired = (value: string, fieldName: string): ValidationResult => {
    if (value.trim() === '') {
        return { isValid: false, error: `${fieldName} is required` };
    }

    return { isValid: true };
};

/**
 * Validates key selection for operations
 */
const validateKeySelection = (
    selectedKeys: { [fingerprint: string]: string },
    fieldName: string
): ValidationResult => {
    const hasSelection = Object.keys(selectedKeys).length > 0;

    if (!hasSelection) {
        return { isValid: false, error: `Please select ${fieldName}` };
    }

    return { isValid: true };
};

/**
 * Collects validation errors from multiple validation results
 */
const collectValidationErrors = (validations: Array<{ field: string; result: ValidationResult }>): FormErrors => {
    const errors: FormErrors = {};

    validations.forEach(({ field, result }) => {
        if (!result.isValid && result.error) {
            errors[field] = result.error;
        }
    });

    return errors;
};

/**
 * Common form validation for key creation
 */
export const validateKeyCreationForm = (
    name: string,
    email: string,
    comment: string,
    passphrase: string,
    confirmPassphrase: string,
    type: PgpAlgorithm,
    rsaBits: number
): FormErrors => {
    const validations = [
        { field: 'userId', result: validateUserId(name, email, comment) },
        { field: 'userId', result: validateMaxLength(name, 'Name', KEY_NAME_MAX_LENGTH) },
        { field: 'userId', result: validateMaxLength(comment, 'Comment', KEY_COMMENT_MAX_LENGTH) },
        { field: 'passphrase', result: validatePassphrase(passphrase) },
        { field: 'confirmPassphrase', result: validatePasswordConfirmation(passphrase, confirmPassphrase) },
        { field: 'algorithm', result: validateRequired(type, 'Algorithm') },
    ];

    if (email.trim().length > 0) {
        validations.push({ field: 'email', result: validateEmail(email) });
        validations.push({ field: 'email', result: validateMaxLength(email, 'Email', KEY_EMAIL_MAX_LENGTH) });
    }

    // Add RSA bits validation if algorithm is RSA
    if (type === 'RSA') {
        validations.push({
            field: 'rsaBits',
            result: rsaBits ? { isValid: true } : { isValid: false, error: 'RSA key size is required' }
        });
    }

    return collectValidationErrors(validations);
};

/**
 * Common form validation for encryption
 */
export const validateEncryptionForm = (
    content: string,
    selectedPublicKeys: { [fingerprint: string]: string },
    selectedPrivateKey: { [fingerprint: string]: string },
    signMessage: boolean
): FormErrors => {
    const validations = [
        { field: 'content', result: validateRequired(content, 'Please enter text to encrypt') },
        { field: 'publicKeys', result: validateKeySelection(selectedPublicKeys, 'at least one public key') },
    ];

    // Add passphrase validation if signing
    if (signMessage && Object.keys(selectedPrivateKey).length === 0) {
        validations.push({
            field: 'privateKeys',
            result: { isValid: false, error: 'Please select a private key when signing' }
        });
    }

    return collectValidationErrors(validations);
};

/**
 * Common form validation for decryption
 */
export const validateDecryptionForm = (
    encryptedContent: string,
    selectedPrivateKey: { [fingerprint: string]: string },
): FormErrors => {
    const validations = [
        { field: 'encryptedContent', result: validateRequired(encryptedContent, 'Please enter encrypted content') },
        { field: 'privateKeys', result: validateKeySelection(selectedPrivateKey, 'a private key') },
    ];

    return collectValidationErrors(validations);
};

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, LayoutAnimation } from 'react-native';
import { commonStyles } from '../../../styles/commonStyles';
import { KeyPair } from '../../../types/types';
import { PassphraseField } from './PassphraseField';
import { KeyList } from './KeyList';
import { CustomText } from '../../../components/CustomText';
import { findDefaultKey, isKeySelected } from '../domain/keyUtils';
import { SettingsOption } from '../../settings/components/SettingsOption';
import { theme } from '../../../styles/theme';
import { useAuth } from '../../auth/state/AuthContext';
import { incrementPopularity, getAllPopularities, sortKeysByPopularity, sortKeysAlphabetically } from '../domain/popularityStorage';
import { KeySelectionModal } from './KeySelectionModal';
import { KeyInfoModal } from './KeyInfoModal';

interface KeySelectionProps {
    title: string;
    keys: KeyPair[];
    selectedKeys: { [fingerprint: string]: string };
    multiSelect: boolean;
    showPassphraseField: boolean;
    setSelectedKeys: React.Dispatch<React.SetStateAction<{ [fingerprint: string]: string }>>;
    optional: boolean;
    setDefaultKey: boolean;
    onPassphraseChange: ((passphrase: string) => void) | undefined;
    type: 'public' | 'private'
    signMessage?: boolean;
    setSignMessage?: React.Dispatch<React.SetStateAction<boolean>>;
    showSignMessageSwitch?: boolean;
    testIDPrefix?: string;
}

const SELECTION_REORDER_DELAY_MS = 650;
type SelectionIntent = 'select' | 'deselect';
type PendingDeselection = { fingerprint: string; value: string };

export const KeySelection: React.FC<KeySelectionProps> = ({
    title,
    keys,
    selectedKeys,
    setSelectedKeys,
    multiSelect,
    showPassphraseField,
    optional,
    setDefaultKey,
    onPassphraseChange,
    type,
    signMessage,
    setSignMessage,
    showSignMessageSwitch = false,
    testIDPrefix,
}) => {
    const { user } = useAuth();
    const [popularityMap, setPopularityMap] = useState<Record<string, number>>({});
    const [modalVisible, setModalVisible] = useState(false);
    const [displaySelectedKeys, setDisplaySelectedKeys] = useState(selectedKeys);
    const [pendingDeselection, setPendingDeselection] = useState<PendingDeselection | null>(null);
    const [displayPopularityMap, setDisplayPopularityMap] = useState<Record<string, number>>({});
    const didInitDisplaySelectionRef = useRef(false);
    const selectionIntentRef = useRef<SelectionIntent | null>(null);

    const [infoModalVisible, setInfoModalVisible] = useState(false);
    const [selectedKeyInfo, setSelectedKeyInfo] = useState<KeyPair | null>(null);

    useEffect(() => {
        if (!didInitDisplaySelectionRef.current) {
            didInitDisplaySelectionRef.current = true;
            setDisplaySelectedKeys(selectedKeys);
            setPendingDeselection(null);
            setDisplayPopularityMap(popularityMap);
            return;
        }

        const intent = selectionIntentRef.current;
        selectionIntentRef.current = null;

        if (intent === 'deselect') {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setDisplaySelectedKeys(selectedKeys);
            setDisplayPopularityMap(popularityMap);
            const timeout = setTimeout(() => {
                setPendingDeselection(null);
            }, SELECTION_REORDER_DELAY_MS);

            return () => clearTimeout(timeout);
        }

        if (intent === 'select') {
            setPendingDeselection(null);
            const timeout = setTimeout(() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setDisplaySelectedKeys(selectedKeys);
                setDisplayPopularityMap(popularityMap);
            }, SELECTION_REORDER_DELAY_MS);

            return () => clearTimeout(timeout);
        }

        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setPendingDeselection(null);
        setDisplaySelectedKeys(selectedKeys);
        setDisplayPopularityMap(popularityMap);
    }, [selectedKeys, popularityMap]);

    // Load popularity map
    useEffect(() => {
        if (user?.uid) {
            getAllPopularities(user.uid)
                .then((popularities) => {
                    setPopularityMap(popularities);
                    setDisplayPopularityMap(popularities);
                })
                .catch(() => { });
        }
    }, [user?.uid]);

    useEffect(() => {
        if (setDefaultKey && keys.length > 0 && Object.keys(selectedKeys).length === 0) {
            const defaultKey = findDefaultKey(keys);
            if (defaultKey) {
                setSelectedKeys({ [defaultKey.fingerprint]: defaultKey.privateKey! });
            }
        }
    }, [keys, selectedKeys, setSelectedKeys]);



    const onToggleKey = useCallback((key: KeyPair) => {
        const isSelected = isKeySelected(key.fingerprint, selectedKeys);
        if (isSelected && (optional || (multiSelect && Object.keys(selectedKeys).length > 1))) {
            selectionIntentRef.current = 'deselect';
            setPendingDeselection({
                fingerprint: key.fingerprint,
                value: selectedKeys[key.fingerprint],
            });
            const newSelected = { ...selectedKeys };
            delete newSelected[key.fingerprint];
            setSelectedKeys(newSelected);
            return;
        }

        selectionIntentRef.current = 'select';
        setPendingDeselection(null);

        // Increment popularity when key is selected
        if (user?.uid) {
            incrementPopularity(user.uid, key.fingerprint).catch(() => {
                // Silently ignore errors
            });
            setPopularityMap(prev => ({
                ...prev,
                [key.fingerprint]: (prev[key.fingerprint] || 0) + 1
            }));
        }

        setSelectedKeys(prev => multiSelect ? ({ ...prev, [key.fingerprint]: type === 'private' ? key.privateKey! : key.publicKey }) : { [key.fingerprint]: type === 'private' ? key.privateKey! : key.publicKey });
    }, [selectedKeys, optional, multiSelect, keys, popularityMap, user, type, setSelectedKeys]);

    const handleLongPressKey = (key: KeyPair) => {
        setSelectedKeyInfo(key);
        setInfoModalVisible(true);
    };

    const sortedKeys = sortKeysByPopularity(keys, displayPopularityMap);
    const visualSelectedKeys = useMemo(() => {
        if (
            !pendingDeselection
            || selectedKeys[pendingDeselection.fingerprint]
        ) {
            return selectedKeys;
        }

        return {
            ...selectedKeys,
            [pendingDeselection.fingerprint]: pendingDeselection.value,
        };
    }, [pendingDeselection, selectedKeys]);
    const selectedKeysArray = keys.filter(k => displaySelectedKeys[k.fingerprint]);
    const unselectedKeys = keys.filter(k => !displaySelectedKeys[k.fingerprint]);
    const sortedSelectedAlphabetical = sortKeysAlphabetically(selectedKeysArray);
    const sortedUnselectedByPopularity = sortKeysByPopularity(unselectedKeys, displayPopularityMap);

    // Show up to 10 keys: selected keys first (alphabetical), then fill with most popular unselected keys
    const selectedToShow = sortedSelectedAlphabetical.slice(0, 10);
    const remainingSlots = Math.max(0, 10 - selectedToShow.length);
    const unselectedToShow = sortedUnselectedByPopularity.slice(0, remainingSlots);

    const displayedKeys = [...selectedToShow, ...unselectedToShow];
    const showViewMore = keys.length > 10;

    return (
        <View style={styles.gapLg}>
            {Object.keys(keys).length > 0 && (
                <>
                    <CustomText style={commonStyles.textLabel}>{title}</CustomText>
                    <KeyList
                        keys={displayedKeys}
                        selectedKeys={[visualSelectedKeys]}
                        onToggleKey={onToggleKey}
                        onLongPressKey={handleLongPressKey}
                        testIDPrefix={testIDPrefix}
                    />

                    {showViewMore && (
                        <TouchableOpacity
                            testID={testIDPrefix ? `${testIDPrefix}.viewMore` : undefined}
                            onPress={() => setModalVisible(true)}
                            style={styles.viewMoreButton}
                        >
                            <CustomText style={styles.viewMoreText}>
                                All Keys
                            </CustomText>
                        </TouchableOpacity>
                    )}

                    {showPassphraseField && Object.keys(selectedKeys).length > 0 && (() => {
                        const fingerprint = Object.keys(selectedKeys)[0];
                        const key = keys.find(k => k.fingerprint === fingerprint);
                        if (!key) return null;
                        return (
                            <>
                                {showSignMessageSwitch && signMessage !== undefined && setSignMessage ?
                                    <SettingsOption
                                        text="Sign message"
                                        testID={testIDPrefix ? `${testIDPrefix}.signMessage` : undefined}
                                        extraText="Embedded and detached signature"
                                        transparentSwitch={true}
                                        switchProps={{
                                            value: signMessage,
                                            onValueChange: setSignMessage
                                        }}
                                    /> : null
                                }
                                {showSignMessageSwitch && signMessage !== undefined && signMessage === false && setSignMessage ?
                                    null :
                                    <PassphraseField
                                        key={fingerprint}
                                        label="Passphrase for Private Key"
                                        testID={testIDPrefix ? `${testIDPrefix}.passphrase` : undefined}
                                        fingerprint={fingerprint}
                                        name={key.userId.trim()}
                                        onPassphraseChange={onPassphraseChange}
                                        hidden={key.privateKeyIsUnlocked}
                                        storedPassphraseValue={key.privateKeyPassphrase}
                                    />

                                }
                            </>
                        );
                    })()}
                </>
            )
            }
            <KeySelectionModal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
                keys={sortedKeys}
                displaySelectedKeys={displaySelectedKeys}
                visualSelectedKeys={visualSelectedKeys}
                onToggleKey={onToggleKey}
                onLongPressKey={handleLongPressKey}
                popularityMap={displayPopularityMap}
            />
            <KeyInfoModal
                visible={infoModalVisible}
                keyPair={selectedKeyInfo}
                onClose={() => setInfoModalVisible(false)}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    gapLg: {
        gap: theme.spacing.md,
    },
    viewMoreButton: {
        alignSelf: 'center',
        marginTop: theme.spacing.sm,
        borderWidth: 1,
        borderColor: theme.colors.primary,
        borderRadius: 999,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        backgroundColor: `${theme.colors.primary}14`,
    },
    viewMoreText: {
        color: theme.colors.primary,
        fontSize: 14,
        fontWeight: '600',
    },
});

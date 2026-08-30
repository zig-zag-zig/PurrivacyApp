import React from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

type AccountAutofillContextProps = {
    username: string | null | undefined;
};

export const AccountAutofillContext = ({ username }: AccountAutofillContextProps) => {
    if (Platform.OS !== 'android' || !username) return null;

    return (
        <View
            accessible={false}
            collapsable={false}
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={styles.container}
        >
            <TextInput
                autoCapitalize="none"
                autoComplete="username"
                autoCorrect={false}
                caretHidden
                collapsable={false}
                contextMenuHidden
                editable
                importantForAutofill="yes"
                onChangeText={() => undefined}
                showSoftInputOnFocus={false}
                style={styles.input}
                textContentType={undefined}
                value={username}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        height: 1,
        left: 0,
        opacity: 0,
        overflow: 'hidden',
        position: 'absolute',
        top: 0,
        width: 1,
    },
    input: {
        height: 1,
        margin: 0,
        padding: 0,
        width: 1,
    },
});

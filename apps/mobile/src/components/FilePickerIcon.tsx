import React from 'react';
import { Keyboard, TouchableOpacity } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { theme } from '../styles/theme';
import { commonStyles } from '../styles/commonStyles';

type FilePickerIconProps = {
    onPress: () => void;
    accessibilityLabel?: string;
};

export const FilePickerIcon: React.FC<FilePickerIconProps> = ({ onPress, accessibilityLabel = 'Upload file' }) => (
    <TouchableOpacity
        onPress={() => {
            Keyboard.dismiss();
            onPress();
        }}
        style={commonStyles.buttonIcon}
        accessibilityLabel={accessibilityLabel}
    >
        <Icon name="attach-file" size={22} color={theme.colors.primary} />
    </TouchableOpacity>
);

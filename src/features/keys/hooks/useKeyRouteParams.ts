import {
  CommonActions,
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { useCallback } from 'react';
import type { Dispatch } from 'react';

import type { KeyScreenRouteProp, RootNavigationProps } from '../../../app/navigation/types';
import { getRouteKeyAction } from '../domain/keyScreenDomain';
import type { KeyScreenAction } from '../state/keyScreenReducer';

export function useKeyRouteParams(dispatch: Dispatch<KeyScreenAction>): void {
  const route = useRoute<KeyScreenRouteProp>();
  const navigation = useNavigation<RootNavigationProps>();

  const clearRouteParam = useCallback((paramName: string) => {
    navigation.dispatch(navState => {
      const routes = navState.routes.map(routeItem =>
        routeItem.key === route.key
          ? { ...routeItem, params: { ...routeItem.params, [paramName]: undefined } }
          : routeItem,
      );

      return CommonActions.reset({
        ...navState,
        routes,
        index: navState.index,
      });
    });
  }, [navigation, route.key]);

  useFocusEffect(
    useCallback(() => {
      if (route.params?.action) {
        dispatch({ type: 'keyActionChanged', keyAction: getRouteKeyAction(route.params.action) });
        clearRouteParam('action');
      }
    }, [clearRouteParam, dispatch, route.params?.action]),
  );

  useFocusEffect(
    useCallback(() => {
      if (route.params?.text) {
        dispatch({ type: 'importKeyChanged', importKey: route.params.text });
        dispatch({ type: 'keyActionChanged', keyAction: 'import' });
        clearRouteParam('text');
      }
    }, [clearRouteParam, dispatch, route.params?.text]),
  );
}

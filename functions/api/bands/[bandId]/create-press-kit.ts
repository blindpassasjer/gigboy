/// <reference types="@cloudflare/workers-types" />
import { onRequestPost as createPressKitHandler } from '../create-press-kit';

export const onRequestPost = createPressKitHandler;

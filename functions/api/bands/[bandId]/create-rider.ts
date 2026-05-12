/// <reference types="@cloudflare/workers-types" />
import { onRequestPost as createRiderHandler } from '../create-rider';

export const onRequestPost = createRiderHandler;

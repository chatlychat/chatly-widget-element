/**
 * The side-effecting entry: `import '@chatlychat/widget-element/register'`.
 *
 * Separate from `index.ts` on purpose. A package that defines a custom
 * element as a side effect of being imported cannot be used for its types or
 * its helpers without that happening, and it breaks any bundle evaluated on a
 * server. Here the side effect is the whole point, and a consumer opts into it
 * by importing this path.
 */
import { defineChatlyWidget } from './element.js';

defineChatlyWidget();

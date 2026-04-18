'use strict';

import { glob, unlink } from 'fs';

return {
	menu_flush: function() {
		for (let path in glob('/tmp/luci-indexcache', '/tmp/luci-indexcache.*'))
			unlink(path);

		system('rm -rf /tmp/luci-modulecache 2>/dev/null');

		http.prepare_content('application/json');
		http.write_json({ flushed: true });
	}
};

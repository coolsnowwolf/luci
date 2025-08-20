'use strict';

return {
	action_release_ram: function() {
		system('sync && echo 3 > /proc/sys/vm/drop_caches');
		http.redirect(dispatcher.build_url('admin/status'));
	}
}

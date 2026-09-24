#!/usr/bin/env python3
import json
import unittest
from generate import ROOT, vendor_for


class Aliases(unittest.TestCase):
    def setUp(self):
        self.vendors = json.loads((ROOT / 'tools/vendors.json').read_text())

    def brand(self, name):
        i = vendor_for(name, self.vendors)
        return None if i is None else self.vendors[i]['slug']

    def test_aliases(self):
        for name in ['ASUSTek COMPUTER INC.', 'ASUSTeK Computer Inc.', 'ASUS',
                     'ASUS COMPUTER INTERNATIONAL']:
            self.assertEqual(self.brand(name), 'asus')
        for name in ["MICRO-STAR INT'L CO., LTD.", 'Micro-Star International']:
            self.assertEqual(self.brand(name), 'msi')
        for name in ['GIGA-BYTE TECHNOLOGY CO.,LTD.', 'GIGA-BYTE TECHNOLOGY CO. , Ltd.']:
            self.assertEqual(self.brand(name), 'gigabyte')
        self.assertEqual(self.brand('vivo Mobile Communication Co., Ltd.'), 'vivo')
        self.assertEqual(self.brand('TP-Link Systems Inc.'), 'tplink')
        self.assertEqual(self.brand('GD Midea Air-Conditioning Equipment Co.,Ltd.'), 'midea')
        self.assertEqual(self.brand('Midea Group Co., Ltd.'), 'midea')
        self.assertEqual(self.brand('Shanghai Imilab Technology Co.Ltd'), 'xiaomi')
        self.assertEqual(self.brand('Shanghai Chuangmi Technology Co., Ltd.'), 'xiaomi')
        self.assertIsNone(self.brand('Chuangming Futre Technology Co., Ltd.'))
        self.assertEqual(self.brand('TCL King Electrical Appliances(Huizhou)Co.,Ltd'), 'tcl')
        self.assertEqual(self.brand('Hui Zhou Gaoshengda Technology Co.,LTD'), 'tcl')

    def test_haier(self):
        for name in ['Qingdao Haier Technology Co.,Ltd',
                     'Qingdao HaierTechnology Co.,Ltd',
                     'QING DAO HAIER TELECOM CO.,LTD.', 'Haier']:
            self.assertEqual(self.brand(name), 'haier')
        self.assertIsNone(self.brand('Unrelated Haier Module Supplier'))
        data = json.loads(next((ROOT / 'htdocs/luci-static/resources/oui').glob('vendors-*.json')).read_text())
        mac = '34:29:EF:89:41:3C'.replace(':', '')
        self.assertEqual(data['vendors'][data['prefixes'][mac[:6]]][0], 'haier')
        self.assertEqual(data['vendors'][data['prefixes']['0439CB']][0], 'haier')

    def test_vmware(self):
        self.assertEqual(self.brand('VMware, Inc.'), 'vmware')
        self.assertIsNone(self.brand('VMware Unrelated Devices'))
        data = json.loads(next((ROOT / 'htdocs/luci-static/resources/oui').glob('vendors-*.json')).read_text())
        for prefix in ['000569', '000C29', '001C14', '005056']:
            self.assertEqual(data['vendors'][data['prefixes'][prefix]], ['vmware', 'VMware'])

    def test_unrelated_names(self):
        for name in ['Pegasus Technologies Inc.', 'Asustor Inc.', 'Vivotek, Inc.',
                     'Invivo Research Inc.', 'Dongguan Koppo Electronic Co.,Ltd',
                     'SHENZHEN HONOR ELECTRONIC CO.,LTD', 'Limidea Concept Pte. Ltd.',
                     'Gigabit Systems Inc.', 'Unrelated Module Manufacturer']:
            self.assertIsNone(self.brand(name))

    def test_assets(self):
        data = json.loads(next((ROOT / 'htdocs/luci-static/resources/oui').glob('vendors-*.json')).read_text())
        for slug, _ in data['vendors']:
            self.assertTrue((ROOT / 'htdocs/luci-static/resources/oui' / (slug + '.svg')).exists())
        self.assertEqual(data['vendors'][data['prefixes']['30560F']][0], 'gigabyte')
        self.assertEqual(data['vendors'][data['prefixes']['E87F95']][0], 'apple')
        self.assertEqual(data['vendors'][data['prefixes']['9C4782']][0], 'tplink')
        self.assertEqual(data['vendors'][data['prefixes']['1841C3']][0], 'midea')
        self.assertEqual(data['vendors'][data['prefixes']['607EA4']][0], 'xiaomi')
        self.assertEqual(data['vendors'][data['prefixes']['0C7955']][0], 'tcl')


if __name__ == '__main__':
    unittest.main()

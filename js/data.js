/* =============================================================================
 * SEA Travel Weather · 静态基础字典
 * -----------------------------------------------------------------------------
 * 只包含面向游客 / 商务出行者的公共信息：国家、城市、机场、航司、官方气象源。
 * 本文件不包含、也不曾包含任何供应商、采购订单、工厂或 Home Depot 相关数据。
 * 天气实况与预报由 scripts/update_data.py 每日生成到 data/weather.json。
 * =========================================================================== */
(function (root) {
  'use strict';

  // L(zh, en, vi, th, id) —— 五语文案简写
  var L = function (zh, en, vi, th, id) {
    return { zh: zh, en: en, vi: vi, th: th, id: id };
  };

  // 机场「航班动态」入口。official = 机场/航司官方页；public = 免登录第三方公开页。
  // 两者都不需要 API Key，页面只做跳转，不声称拿到了实时航班数据。
  var link = function (kind, url, note) {
    return { kind: kind, url: url, note: note || '' };
  };

  var COUNTRIES = [
    {
      id: 'vn', iso: 'VN', flag: '🇻🇳', tz: 'Asia/Ho_Chi_Minh', utc: 'GMT+7',
      dial: '+84', emergency: { police: '113', ambulance: '115', fire: '114' },
      name: L('越南', 'Vietnam', 'Việt Nam', 'เวียดนาม', 'Vietnam'),
      capital: L('河内', 'Hanoi', 'Hà Nội', 'ฮานอย', 'Hanoi'),
      intro: L('南北狭长，5–11 月为雨季，中部沿海 10–11 月台风与强降雨集中。',
        'Long north–south coastline; rainy season May–Nov, with typhoons and heavy rain on the central coast in Oct–Nov.',
        'Bờ biển dài theo chiều Bắc–Nam; mùa mưa tháng 5–11, bão và mưa lớn tập trung ở miền Trung tháng 10–11.',
        'ชายฝั่งยาวเหนือ–ใต้ ฤดูฝน พ.ค.–พ.ย. โดย ต.ค.–พ.ย. มีพายุและฝนตกหนักบริเวณชายฝั่งตอนกลาง',
        'Garis pantai panjang utara–selatan; musim hujan Mei–Nov, angin topan dan hujan lebat di pesisir tengah pada Okt–Nov.'),
      tips: [
        L('雨季午后短时强降雨常见，市区低洼路段易积水，机场转场预留 60 分钟以上。',
          'Afternoon downpours are common in the rainy season; allow 60+ extra minutes for airport transfers.',
          'Mưa lớn buổi chiều thường gặp mùa mưa; cộng thêm 60 phút khi đi sân bay.',
          'ฝนตกหนักช่วงบ่ายพบบ่อย เผื่อเวลาเดินทางไปสนามบินอย่างน้อย 60 นาที',
          'Hujan deras sore hari umum di musim hujan; tambahkan 60+ menit untuk perjalanan ke bandara.'),
        L('台风季跨岛渡轮与富国岛、岘港海上项目可能临时停运，出发前查航司与船公司公告。',
          'Island ferries and sea tours (Phu Quoc, Da Nang) may suspend during typhoon season — check operator notices.',
          'Mùa bão, phà và tour biển (Phú Quốc, Đà Nẵng) có thể tạm ngưng; kiểm tra thông báo của đơn vị vận hành.',
          'ในช่วงพายุ เรือข้ามเกาะและทัวร์ทางทะเลอาจระงับ ตรวจสอบประกาศของผู้ให้บริการ',
          'Saat musim topan, feri dan wisata laut dapat dibatalkan; cek pengumuman operator.')
      ],
      controls: [
        { id: 'VN-MOT', kind: 'road', label: L('交通运输部 · 公路与海事通告', 'Ministry of Transport · road & maritime notices', 'Bộ GTVT · thông báo đường bộ & hàng hải', 'กระทรวงคมนาคม · ประกาศทางบกและทางทะเล', 'Kementerian Perhubungan · pengumuman jalan & laut'), url: 'https://www.mt.gov.vn/' },
        { id: 'VN-CAAV', kind: 'aviation', label: L('越南民航局 · 机场与空域通告', 'CAAV · airport & airspace notices', 'Cục Hàng không · thông báo sân bay', 'สำนักงานการบินพลเรือน · ประกาศสนามบิน', 'Otoritas Penerbangan Sipil · notisi bandara'), url: 'https://caa.gov.vn/' },
        { id: 'VN-DM', kind: 'gov', label: L('国家防灾与堤防管理 · 灾情通报', 'Disaster & Dyke Management · situation reports', 'Quản lý đê điều & PCTT · báo cáo tình hình', 'สำนักจัดการภัยพิบัติ · รายงานสถานการณ์', 'Badan Penanggulangan Bencana · laporan situasi'), url: 'https://phongchongthientai.mard.gov.vn/' }
      ],
      sources: [
        { id: 'VN-NCHMF', label: L('越南国家水文气象预报中心 NCHMF', 'NCHMF · National Center for Hydro-Meteorological Forecasting', 'NCHMF · Trung tâm Dự báo Khí tượng Thủy văn', 'NCHMF · ศูนย์พยากรณ์อากาศ', 'NCHMF · Pusat Prakiraan Cuaca'), url: 'https://nchmf.gov.vn/', kind: 'wx' },
        { id: 'VN-KTTV', label: L('越南气象水文总局 · 十日趋势', 'Vietnam Meteorological Administration · 10-day outlook', 'Cục KTTV · Xu hướng 10 ngày', 'กรมอุตุนิยมวิทยา · แนวโน้ม 10 วัน', 'BMKG Vietnam · Prospek 10 hari'), url: 'https://thoitietvietnam.gov.vn/', kind: 'wx' },
        { id: 'VN-GOV', label: L('越南政府门户 · 防灾指令', 'Vietnam Government Portal · disaster directives', 'Cổng Chính phủ · Chỉ đạo phòng chống thiên tai', 'พอร์ทัลรัฐบาล · คำสั่งป้องกันภัย', 'Portal Pemerintah · Arahan bencana'), url: 'https://chinhphu.vn/', kind: 'gov' }
      ],
      cities: [
        { id: 'hcm', name: L('胡志明市', 'Ho Chi Minh City', 'TP. Hồ Chí Minh', 'โฮจิมินห์ซิตี', 'Kota Ho Chi Minh'), lat: 10.8231, lon: 106.6297, airport: 'SGN', flood: true, coastal: false, island: false, mountain: false },
        { id: 'hanoi', name: L('河内', 'Hanoi', 'Hà Nội', 'ฮานอย', 'Hanoi'), lat: 21.0278, lon: 105.8342, airport: 'HAN', flood: true, coastal: false, island: false, mountain: false },
        { id: 'danang', name: L('岘港', 'Da Nang', 'Đà Nẵng', 'ดานัง', 'Da Nang'), lat: 16.0544, lon: 108.2022, airport: 'DAD', flood: true, coastal: true, island: false, mountain: false },
        { id: 'phuquoc', name: L('富国岛', 'Phu Quoc', 'Phú Quốc', 'ฟู้โกว๊ก', 'Phu Quoc'), lat: 10.2270, lon: 103.9570, airport: 'PQC', flood: false, coastal: true, island: true, mountain: false },
        { id: 'nhatrang', name: L('芽庄', 'Nha Trang', 'Nha Trang', 'ญาจาง', 'Nha Trang'), lat: 12.2388, lon: 109.1967, airport: 'CXR', flood: false, coastal: true, island: false, mountain: false },
        { id: 'quynhon', name: L('归仁', 'Quy Nhon', 'Quy Nhơn', 'กวีเญิน', 'Quy Nhon'), lat: 13.7563, lon: 109.2295, airport: 'UIH', flood: true, coastal: true, island: false, mountain: false },
        { id: 'dalat', name: L('大叻', 'Da Lat', 'Đà Lạt', 'ดาลัด', 'Da Lat'), lat: 11.9404, lon: 108.4583, airport: 'DLI', flood: false, coastal: false, island: false, mountain: true },
        { id: 'bacninh', name: L('北宁', 'Bac Ninh', 'Bắc Ninh', 'บั๊กนิญ', 'Bac Ninh'), lat: 21.1861, lon: 106.0763, airport: 'HAN', flood: false, coastal: false, island: false, mountain: false },
        { id: 'bacgiang', name: L('北江', 'Bac Giang', 'Bắc Giang', 'บั๊กซาง', 'Bac Giang'), lat: 21.2739, lon: 106.1954, airport: 'HAN', flood: false, coastal: false, island: false, mountain: false },
        { id: 'haiphong', name: L('海防', 'Hai Phong', 'Hải Phòng', 'ไฮฟอง', 'Hai Phong'), lat: 20.8449, lon: 106.6881, airport: 'HPH', flood: true, coastal: true, island: false, mountain: false },
        { id: 'binhduong', name: L('平阳·土龙木', 'Binh Duong (Thu Dau Mot)', 'Bình Dương (Thủ Dầu Một)', 'บิ่ญเซือง', 'Binh Duong'), lat: 10.9804, lon: 106.6519, airport: 'SGN', flood: false, coastal: false, island: false, mountain: false },
        { id: 'dongnai', name: L('同奈·边和', 'Dong Nai (Bien Hoa)', 'Đồng Nai (Biên Hòa)', 'ด่งนาย', 'Dong Nai'), lat: 10.9447, lon: 106.8233, airport: 'SGN', flood: false, coastal: false, island: false, mountain: false },
      ],
      airports: [
        { iata: 'SGN', name: L('新山一国际机场', 'Tan Son Nhat Intl', 'Tân Sơn Nhất', 'ทันซอนญัต', 'Tan Son Nhat'), city: 'hcm', lat: 10.8189, lon: 106.6519, board: link('official', 'https://www.vietnamairport.vn/tansonnhatairport/', 'ACV'), live: 'https://www.flightaware.com/live/airport/VVTS' },
        { iata: 'HAN', name: L('内排国际机场', 'Noi Bai Intl', 'Nội Bài', 'นอยบาย', 'Noi Bai'), city: 'hanoi', lat: 21.2212, lon: 105.8072, board: link('official', 'https://www.vietnamairport.vn/noibaiairport/', 'ACV'), live: 'https://www.flightaware.com/live/airport/VVNB' },
        { iata: 'DAD', name: L('岘港国际机场', 'Da Nang Intl', 'Đà Nẵng', 'ดานัง', 'Da Nang'), city: 'danang', lat: 16.0439, lon: 108.1990, board: link('official', 'https://www.vietnamairport.vn/danangairport/', 'ACV'), live: 'https://www.flightaware.com/live/airport/VVDN' },
        { iata: 'PQC', name: L('富国国际机场', 'Phu Quoc Intl', 'Phú Quốc', 'ฟู้โกว๊ก', 'Phu Quoc'), city: 'phuquoc', lat: 10.1698, lon: 103.9931, board: link('public', 'https://www.flightaware.com/live/airport/VVPQ', ''), live: 'https://www.flightaware.com/live/airport/VVPQ' },
        { iata: 'CXR', name: L('金兰国际机场（芽庄）', 'Cam Ranh Intl (Nha Trang)', 'Cam Ranh (Nha Trang)', 'คัมรานห์ (ญาจาง)', 'Cam Ranh (Nha Trang)'), city: 'nhatrang', lat: 11.9982, lon: 109.2194, board: link('public', 'https://www.flightaware.com/live/airport/VVCR', 'FlightAware'), live: 'https://www.flightaware.com/live/airport/VVCR' },
        { iata: 'UIH', name: L('符吉机场（归仁）', 'Phu Cat (Quy Nhon)', 'Phù Cát (Quy Nhơn)', 'ฟู้กาต (กวีเญิน)', 'Phu Cat (Quy Nhon)'), city: 'quynhon', lat: 13.9550, lon: 109.0420, board: link('public', 'https://www.flightaware.com/live/airport/VVPC', 'FlightAware'), live: 'https://www.flightaware.com/live/airport/VVPC' },
        { iata: 'DLI', name: L('莲姜机场（大叻）', 'Lien Khuong (Da Lat)', 'Liên Khương (Đà Lạt)', 'เลียนเคือง (ดาลัด)', 'Lien Khuong (Da Lat)'), city: 'dalat', lat: 11.7500, lon: 108.3700, board: link('public', 'https://www.flightaware.com/live/airport/VVDL', 'FlightAware'), live: 'https://www.flightaware.com/live/airport/VVDL' },
        { iata: 'HPH', name: L('吉碑国际机场（海防）', 'Cat Bi Intl (Hai Phong)', 'Cát Bi (Hải Phòng)', 'กาดบี (ไฮฟอง)', 'Cat Bi (Hai Phong)'), city: 'haiphong', lat: 20.8200, lon: 106.7250, board: link('public', 'https://www.flightaware.com/live/airport/VVCI', 'FlightAware'), live: 'https://www.flightaware.com/live/airport/VVCI' },
      ],
      airlines: [
        { code: 'VN', name: L('越南航空', 'Vietnam Airlines', 'Vietnam Airlines', 'เวียดนามแอร์ไลน์', 'Vietnam Airlines'), url: 'https://www.vietnamairlines.com/' },
        { code: 'VJ', name: L('越捷航空', 'VietJet Air', 'VietJet Air', 'เวียดเจ็ท', 'VietJet Air'), url: 'https://www.vietjetair.com/' },
        { code: 'QH', name: L('竹子航空', 'Bamboo Airways', 'Bamboo Airways', 'แบมบูแอร์เวย์', 'Bamboo Airways'), url: 'https://www.bambooairways.com/' }
      ]
    },
    {
      id: 'th', iso: 'TH', flag: '🇹🇭', tz: 'Asia/Bangkok', utc: 'GMT+7',
      dial: '+66', emergency: { police: '191', ambulance: '1669', fire: '199' },
      name: L('泰国', 'Thailand', 'Thái Lan', 'ไทย', 'Thailand'),
      capital: L('曼谷', 'Bangkok', 'Bangkok', 'กรุงเทพฯ', 'Bangkok'),
      intro: L('季风期 5–10 月，曼谷及周边易内涝；安达曼海与普吉 7–10 月风浪较大。',
        'Monsoon May–Oct; Bangkok and nearby provinces are flood-prone. Rough Andaman seas near Phuket in Jul–Oct.',
        'Mùa gió mùa tháng 5–10; Bangkok dễ ngập, biển Andaman quanh Phuket động mạnh tháng 7–10.',
        'ฤดูมรสุม พ.ค.–ต.ค. กรุงเทพฯ เสี่ยงน้ำท่วม ทะเลอันดามันคลื่นแรง ก.ค.–ต.ค.',
        'Monsun Mei–Okt; Bangkok rawan banjir, laut Andaman sekitar Phuket bergelombang Jul–Okt.'),
      tips: [
        L('曼谷晚高峰叠加降雨时，素万那普/廊曼机场路程可能翻倍，建议提前 3 小时出发。',
          'Bangkok rush hour plus rain can double transfer time to BKK/DMK — leave 3 hours ahead.',
          'Giờ cao điểm Bangkok kết hợp mưa có thể tăng gấp đôi thời gian ra sân bay; đi trước 3 giờ.',
          'ชั่วโมงเร่งด่วนกรุงเทพฯ + ฝน อาจใช้เวลาไปสนามบินเป็นสองเท่า ออกเดินทางล่วงหน้า 3 ชม.',
          'Jam sibuk Bangkok + hujan bisa menggandakan waktu ke bandara; berangkat 3 jam lebih awal.'),
        L('普吉、甲米等海岛渡轮受风浪影响停航较常见，不要把当天渡轮与当天国际航班紧接。',
          'Island ferries (Phuket, Krabi) are often suspended in rough seas — avoid tight same-day ferry + international flight connections.',
          'Phà đảo (Phúc Kiến/Krabi, Phuket) hay ngưng khi biển động; tránh nối phà và chuyến bay quốc tế cùng ngày.',
          'เรือข้ามเกาะภูเก็ต/กระบี่มักระงับเมื่อคลื่นแรง อย่าต่อเครื่องบินระหว่างประเทศวันเดียวกัน',
          'Feri pulau sering dibatalkan saat laut bergelombang; jangan sambung feri + penerbangan internasional di hari sama.')
      ],
      controls: [
        { id: 'TH-DOH', kind: 'road', label: L('公路厅 · 封路与道路状况', 'Department of Highways · road closures & conditions', 'กรมทางหลวง · ปิดถนนและสภาพทาง', 'กรมทางหลวง · ปิดถนนและสภาพทาง', 'Dinas Jalan Raya · penutupan jalan'), url: 'https://www.doh.go.th/' },
        { id: 'TH-DDPM', kind: 'gov', label: L('防灾减灾厅 · 灾害与交通管制公告', 'DDPM · disaster & traffic control notices', 'DDPM · ประกาศภัยพิบัติและควบคุมจราจร', 'กรมป้องกันและบรรเทาสาธารณภัย · ประกาศ', 'Badan Bencana · pengumuman pembatasan lalu lintas'), url: 'https://www.disaster.go.th/' },
        { id: 'TH-WATER', kind: 'marine', label: L('ThaiWater · 河流水位与洪水监视', 'ThaiWater · river levels & flood watch', 'ThaiWater · mực nước sông & lũ', 'ThaiWater · ระดับน้ำและน้ำท่วม', 'ThaiWater · tinggi air sungai & banjir'), url: 'https://www.thaiwater.net/' }
      ],
      sources: [
        { id: 'TH-TMD', label: L('泰国气象局 TMD', 'Thai Meteorological Department (TMD)', 'Cục Khí tượng Thái Lan (TMD)', 'กรมอุตุนิยมวิทยา (TMD)', 'Badan Meteorologi Thailand (TMD)'), url: 'https://www.tmd.go.th/en', kind: 'wx' },
        { id: 'TH-WATER', label: L('泰国水资源信息网 · 实时水位', 'ThaiWater · live water levels', 'ThaiWater · mực nước thực tế', 'ThaiWater · ระดับน้ำ', 'ThaiWater · Tinggi muka air'), url: 'http://www.thaiwater.net/', kind: 'wx' },
        { id: 'TH-AOT', label: L('泰国机场公司 AOT · 机场通告', 'Airports of Thailand · airport notices', 'AOT · Thông báo sân bay', 'AOT · ประกาศสนามบิน', 'AOT · Pengumuman bandara'), url: 'https://www.airportthai.co.th/', kind: 'aviation' }
      ],
      cities: [
        { id: 'bangkok', name: L('曼谷', 'Bangkok', 'Bangkok', 'กรุงเทพฯ', 'Bangkok'), lat: 13.7563, lon: 100.5018, airport: 'BKK', flood: true, coastal: false, island: false, mountain: false },
        { id: 'chiangmai', name: L('清迈', 'Chiang Mai', 'Chiang Mai', 'เชียงใหม่', 'Chiang Mai'), lat: 18.7883, lon: 98.9853, airport: 'CNX', flood: false, coastal: false, island: false, mountain: true },
        { id: 'phuket', name: L('普吉', 'Phuket', 'Phuket', 'ภูเก็ต', 'Phuket'), lat: 7.8804, lon: 98.3923, airport: 'HKT', flood: true, coastal: true, island: true, mountain: false },
        { id: 'pattaya', name: L('芭提雅', 'Pattaya', 'Pattaya', 'พัทยา', 'Pattaya'), lat: 12.9236, lon: 100.8825, airport: 'BKK', flood: true, coastal: true, island: false, mountain: false },
        { id: 'chonburi', name: L('春武里', 'Chonburi', 'Chonburi', 'ชลบุรี', 'Chonburi'), lat: 13.3611, lon: 100.9847, airport: 'BKK', flood: true, coastal: true, island: false, mountain: false },
        { id: 'rayong', name: L('罗勇', 'Rayong', 'Rayong', 'ระยอง', 'Rayong'), lat: 12.6833, lon: 101.2833, airport: 'UTP', flood: false, coastal: true, island: false, mountain: false },
        { id: 'chachoengsao', name: L('北柳', 'Chachoengsao', 'Chachoengsao', 'ฉะเชิงเทรา', 'Chachoengsao'), lat: 13.6900, lon: 101.0833, airport: 'BKK', flood: true, coastal: false, island: false, mountain: false },
        { id: 'ayutthaya', name: L('大城', 'Ayutthaya', 'Ayutthaya', 'อยุธยา', 'Ayutthaya'), lat: 14.3532, lon: 100.5765, airport: 'BKK', flood: true, coastal: false, island: false, mountain: false },
        { id: 'samutprakan', name: L('北榄', 'Samut Prakan', 'Samut Prakan', 'สมุทรปราการ', 'Samut Prakan'), lat: 13.5990, lon: 100.5968, airport: 'BKK', flood: true, coastal: true, island: false, mountain: false },
        { id: 'samutsakhon', name: L('龙仔厝', 'Samut Sakhon', 'Samut Sakhon', 'สมุทรสาคร', 'Samut Sakhon'), lat: 13.5479, lon: 100.2748, airport: 'BKK', flood: true, coastal: true, island: false, mountain: false },
      ],
      airports: [
        { iata: 'BKK', name: L('素万那普机场', 'Suvarnabhumi', 'Suvarnabhumi', 'สุวรรณภูมิ', 'Suvarnabhumi'), city: 'bangkok', lat: 13.6900, lon: 100.7501, board: link('official', 'https://www.suvarnabhumi.airportthai.co.th/flight-information', 'AOT'), live: 'https://www.flightaware.com/live/airport/VTBS' },
        { iata: 'DMK', name: L('廊曼机场', 'Don Mueang', 'Don Mueang', 'ดอนเมือง', 'Don Mueang'), city: 'bangkok', lat: 13.9126, lon: 100.6068, board: link('official', 'https://www.donmueang.airportthai.co.th/', 'AOT'), live: 'https://www.flightaware.com/live/airport/VTBD' },
        { iata: 'CNX', name: L('清迈机场', 'Chiang Mai Intl', 'Chiang Mai', 'เชียงใหม่', 'Chiang Mai'), city: 'chiangmai', lat: 18.7768, lon: 98.9626, board: link('official', 'https://www.chiangmai.airportthai.co.th/', 'AOT'), live: 'https://www.flightaware.com/live/airport/VTCC' },
        { iata: 'HKT', name: L('普吉机场', 'Phuket Intl', 'Phuket', 'ภูเก็ต', 'Phuket'), city: 'phuket', lat: 8.1132, lon: 98.3069, board: link('official', 'https://www.phuket.airportthai.co.th/', 'AOT'), live: 'https://www.flightaware.com/live/airport/VTSP' },
        { iata: 'UTP', name: L('乌塔堡国际机场（罗勇/芭提雅）', 'U-Tapao Intl (Rayong/Pattaya)', 'U-Tapao (Rayong/Pattaya)', 'อู่ตะเภา (ระยอง/พัทยา)', 'U-Tapao (Rayong/Pattaya)'), city: 'rayong', lat: 12.6736, lon: 101.0063, board: link('public', 'https://www.flightaware.com/live/airport/VTBU', 'FlightAware'), live: 'https://www.flightaware.com/live/airport/VTBU' },
      ],
      airlines: [
        { code: 'TG', name: L('泰国国际航空', 'Thai Airways', 'Thai Airways', 'การบินไทย', 'Thai Airways'), url: 'https://www.thaiairways.com/' },
        { code: 'FD', name: L('泰国亚洲航空', 'Thai AirAsia', 'Thai AirAsia', 'แอร์เอเชียไทย', 'Thai AirAsia'), url: 'https://www.airasia.com/' },
        { code: 'PG', name: L('曼谷航空', 'Bangkok Airways', 'Bangkok Airways', 'บางกอกแอร์เวย์', 'Bangkok Airways'), url: 'https://www.bangkokair.com/' }
      ]
    },
    {
      id: 'sg', iso: 'SG', flag: '🇸🇬', tz: 'Asia/Singapore', utc: 'GMT+8',
      dial: '+65', emergency: { police: '999', ambulance: '995', fire: '995' },
      name: L('新加坡', 'Singapore', 'Singapore', 'สิงคโปร์', 'Singapura'),
      capital: L('新加坡', 'Singapore', 'Singapore', 'สิงคโปร์', 'Singapura'),
      intro: L('全年高温多雨，11–1 月东北季风降雨最集中；短时雷暴会影响露天行程但机场运行通常稳定。',
        'Hot and wet year-round; Northeast monsoon peaks Nov–Jan. Short thunderstorms disrupt outdoor plans but Changi usually runs normally.',
        'Nóng ẩm quanh năm; gió mùa Đông Bắc mạnh tháng 11–1. Giông ngắn ảnh hưởng hoạt động ngoài trời, sân bay thường ổn định.',
        'ร้อนชื้นตลอดปี มรสุมตะวันออกเฉียงเหนือ พ.ย.–ม.ค. ฝนฟ้าคะนองกระทบกิจกรรมกลางแจ้ง แต่สนามบินมักปกติ',
        'Panas dan lembap sepanjang tahun; monsun timur laut memuncak Nov–Jan. Badai petir mengganggu kegiatan luar ruang, bandara umumnya normal.'),
      tips: [
        L('雷暴多发于午后，樟宜机场极少因天气大面积取消；但转机衔接仍建议留足 2 小时。',
          'Afternoon thunderstorms are common; Changi rarely sees mass weather cancellations, but keep a 2-hour connection buffer.',
          'Giông chiều thường gặp; Changi hiếm khi hủy hàng loạt do thời tiết, vẫn nên giữ 2 giờ nối chuyến.',
          'ฝนฟ้าคะนองช่วงบ่ายพบบ่อย ชางงี rarely ยกเลิกจำนวนมาก แต่เผื่อเวลาต่อเครื่อง 2 ชม.',
          'Badai petir sore umum; Changi jarang membatalkan massal, tetap sediakan buffer 2 jam transit.'),
        L('跨境去新山（马来西亚）的 Causeway 在雨天的早晚高峰拥堵明显，商务约会建议预留弹性。',
          'The Causeway to Johor Bahru jams badly in rain + peak hours — leave slack for business meetings.',
          'Cầu Causeway sang Johor Bahru hay tắc khi mưa và giờ cao điểm; nên dự phòng thời gian cho lịch họp.',
          'สะพาน Causeway ไปยะโฮร์ติดขัดเมื่อฝนตก+ชั่วโมงเร่งด่วน เผื่อเวลาสำหรับนัดหมายธุรกิจ',
          'Causeway ke Johor Bahru macet saat hujan + jam sibuk; sediakan waktu ekstra untuk rapat.')
      ],
      controls: [
        { id: 'SG-LTA', kind: 'road', label: L('陆路交通管理局 · 道路封闭与交通公告', 'LTA · road closures & traffic notices', 'LTA · đóng đường & thông báo giao thông', 'LTA · ปิดถนนและประกาศจราจร', 'LTA · penutupan jalan & notisi lalu lintas'), url: 'https://www.lta.gov.sg/' },
        { id: 'SG-NEA', kind: 'gov', label: L('国家环境局 · 天气与烟雾公告', 'NEA · weather & haze advisories', 'NEA · cảnh báo thời tiết & sương mù', 'NEA · ประกาศอากาศและหมอกควัน', 'NEA · peringatan cuaca & kabut asap'), url: 'https://www.nea.gov.sg/' },
        { id: 'SG-MPA', kind: 'marine', label: L('海事及港务管理局 · 港口通航通告', 'MPA · port & navigation notices', 'MPA · thông báo cảng & hàng hải', 'MPA · ประกาศท่าเรือและเดินเรือ', 'MPA · notisi pelabuhan & navigasi'), url: 'https://www.mpa.gov.sg/' }
      ],
      sources: [
        { id: 'SG-MSS', label: L('新加坡气象署 MSS · 天气与预警', 'Meteorological Service Singapore (MSS)', 'MSS · Cục Khí tượng Singapore', 'MSS · กรมอุตุนิยมวิทยาสิงคโปร์', 'MSS · Badan Meteorologi Singapura'), url: 'http://www.weather.gov.sg/', kind: 'wx' },
        { id: 'SG-NEA', label: L('新加坡国家环境局 NEA · 烟霾/环境', 'NEA · haze & environment', 'NEA · Khói bụi & môi trường', 'NEA · ฝุ่นควัน', 'NEA · Kabut asap'), url: 'https://www.nea.gov.sg/', kind: 'gov' },
        { id: 'SG-CHANGI', label: L('樟宜机场 · 航班动态', 'Changi Airport · flight information', 'Changi · Thông tin chuyến bay', 'ชางงี · ข้อมูลเที่ยวบิน', 'Changi · Informasi penerbangan'), url: 'https://www.changiairport.com/en/flights.html', kind: 'aviation' }
      ],
      cities: [
        { id: 'singapore', name: L('新加坡（全岛）', 'Singapore (island-wide)', 'Singapore (toàn đảo)', 'สิงคโปร์ (ทั่วเกาะ)', 'Singapura (seluruh pulau)'), lat: 1.3521, lon: 103.8198, airport: 'SIN', flood: false, coastal: true, island: true, mountain: false },
        { id: 'jurong', name: L('裕廊 / 西部', 'Jurong / West', 'Jurong / phía Tây', 'จูรง / ตะวันตก', 'Jurong / Barat'), lat: 1.3329, lon: 103.7436, airport: 'SIN', flood: false, coastal: true, island: true, mountain: false },
        { id: 'changi', name: L('樟宜 / 东部', 'Changi / East', 'Changi / phía Đông', 'ชางงี / ตะวันออก', 'Changi / Timur'), lat: 1.3644, lon: 103.9915, airport: 'SIN', flood: false, coastal: true, island: true, mountain: false }
      ],
      airports: [
        { iata: 'SIN', name: L('樟宜国际机场', 'Singapore Changi', 'Changi', 'ชางงี', 'Changi'), city: 'changi', lat: 1.3644, lon: 103.9915, board: link('official', 'https://www.changiairport.com/en/flights.html', 'CAG'), live: 'https://www.flightaware.com/live/airport/WSSS' }
      ],
      airlines: [
        { code: 'SQ', name: L('新加坡航空', 'Singapore Airlines', 'Singapore Airlines', 'สิงคโปร์แอร์ไลน์', 'Singapore Airlines'), url: 'https://www.singaporeair.com/' },
        { code: 'TR', name: L('酷航', 'Scoot', 'Scoot', 'สกู๊ต', 'Scoot'), url: 'https://www.flyscoot.com/' }
      ]
    },
    {
      id: 'my', iso: 'MY', flag: '🇲🇾', tz: 'Asia/Kuala_Lumpur', utc: 'GMT+8',
      dial: '+60', emergency: { police: '999', ambulance: '999', fire: '994' },
      name: L('马来西亚', 'Malaysia', 'Malaysia', 'มาเลเซีย', 'Malaysia'),
      capital: L('吉隆坡', 'Kuala Lumpur', 'Kuala Lumpur', 'กัวลาลัมเปอร์', 'Kuala Lumpur'),
      intro: L('11–3 月东北季风影响东海岸与沙巴；西海岸（槟城、巴生谷）午后雷暴与短时内涝常见。',
        'Northeast monsoon Nov–Mar hits the east coast and Sabah; afternoon thunderstorms and flash floods affect the west coast (Penang, Klang Valley).',
        'Gió mùa Đông Bắc tháng 11–3 ảnh hưởng bờ Đông và Sabah; giông chiều và ngập cục bộ ở bờ Tây (Penang, Klang Valley).',
        'มรสุมตะวันออกเฉียงเหนือ พ.ย.–มี.ค. กระทบชายฝั่งตะวันออกและซาบาห์ ฝนฟ้าคะนองช่วงบ่ายฝั่งตะวันตก',
        'Monsun timur laut Nov–Mar melanda pantai timur dan Sabah; badai petir sore di pantai barat (Penang, Lembah Klang).'),
      tips: [
        L('吉隆坡市区到 KLIA 约 60–90 分钟，暴雨时段建议改乘 KLIA Ekspres 避免高速拥堵。',
          'KL to KLIA takes 60–90 min; in heavy rain prefer KLIA Ekspres rail over the highway.',
          'KL đến KLIA 60–90 phút; khi mưa lớn nên đi KLIA Ekspres thay vì đường cao tốc.',
          'กัวลาลัมเปอร์–KLIA 60–90 นาที หากฝนตกหนักใช้รถไฟ KLIA Ekspres แทนทางด่วน',
          'KL ke KLIA 60–90 menit; saat hujan deras gunakan KLIA Ekspres daripada jalan tol.'),
        L('东海岸与沙巴岛屿渡轮在季风期常停航，商务行程尽量避开当日往返海岛。',
          'East-coast and Sabah island ferries often stop in monsoon season — avoid same-day island returns on business trips.',
          'Phà đảo bờ Đông và Sabah hay ngưng mùa gió mùa; tránh khứ hồi đảo trong ngày khi đi công tác.',
          'เรือเกาะฝั่งตะวันออก/ซาบาห์มักหยุดในมรสุม หลีกเลี่ยงไป–กลับเกาะวันเดียวสำหรับงานธุรกิจ',
          'Feri pulau pantai timur/Sabah sering berhenti saat monsun; hindari pulang-pergi pulau sehari untuk perjalanan bisnis.')
      ],
      controls: [
        { id: 'MY-LLM', kind: 'road', label: L('马来西亚大道局 · 高速封闭与路况', 'LLM · highway closures & traffic', 'LLM · đóng cao tốc & giao thông', 'LLM · ปิดทางด่วนและจราจร', 'LLM · penutupan tol & lalu lintas'), url: 'https://www.llm.gov.my/' },
        { id: 'MY-NADMA', kind: 'gov', label: L('国家灾害管理局 · 灾情与管制公告', 'NADMA · disaster & control notices', 'NADMA · thông báo thiên tai', 'NADMA · ประกาศภัยพิบัติ', 'NADMA · pengumuman bencana'), url: 'https://www.nadma.gov.my/' },
        { id: 'MY-MET', kind: 'wx', label: L('马来西亚气象局 · 暴雨与大风预警', 'MetMalaysia · heavy rain & wind warnings', 'MetMalaysia · cảnh báo mưa lớn & gió', 'MetMalaysia · เตือนฝนหนักและลมแรง', 'BMKG Malaysia · peringatan hujan & angin'), url: 'https://www.met.gov.my/' }
      ],
      sources: [
        { id: 'MY-MET', label: L('马来西亚气象局 MET Malaysia', 'Malaysian Meteorological Department (MET)', 'Cục Khí tượng Malaysia (MET)', 'กรมอุตุนิยมวิทยามาเลเซีย', 'Badan Meteorologi Malaysia (MET)'), url: 'https://www.met.gov.my/', kind: 'wx' },
        { id: 'MY-FLOOD', label: L('公共洪水预警系统 · 水位', 'Public Info Banjir · flood & water levels', 'Thông tin lũ · mực nước', 'ระบบแจ้งเตือนน้ำท่วม', 'Info Banjir · Tinggi air'), url: 'https://publicinfobanjir.water.gov.my/', kind: 'wx' },
        { id: 'MY-MAHB', label: L('马来西亚机场控股 MAHB · 航班动态', 'Malaysia Airports · flight information', 'Malaysia Airports · Chuyến bay', 'Malaysia Airports · ข้อมูลเที่ยวบิน', 'Malaysia Airports · Penerbangan'), url: 'https://www.malaysiaairports.com.my/', kind: 'aviation' }
      ],
      cities: [
        { id: 'kl', name: L('吉隆坡', 'Kuala Lumpur', 'Kuala Lumpur', 'กัวลาลัมเปอร์', 'Kuala Lumpur'), lat: 3.1390, lon: 101.6869, airport: 'KUL', flood: true, coastal: false, island: false, mountain: false },
        { id: 'penang', name: L('槟城 / 乔治市', 'Penang / George Town', 'Penang / George Town', 'ปีนัง / จอร์จทาวน์', 'Penang / George Town'), lat: 5.4141, lon: 100.3288, airport: 'PEN', flood: true, coastal: true, island: false, mountain: false },
        { id: 'kotakinabalu', name: L('亚庇 / 沙巴', 'Kota Kinabalu / Sabah', 'Kota Kinabalu / Sabah', 'โกตากินาบาลู / ซาบาห์', 'Kota Kinabalu / Sabah'), lat: 5.9804, lon: 116.0735, airport: 'BKI', flood: true, coastal: true, island: false, mountain: true },
        { id: 'johor', name: L('新山', 'Johor Bahru', 'Johor Bahru', 'ยะโฮร์บาห์รู', 'Johor Bahru'), lat: 1.4927, lon: 103.7414, airport: 'JHB', flood: true, coastal: true, island: false, mountain: false }
      ],
      airports: [
        { iata: 'KUL', name: L('吉隆坡国际机场 KLIA', 'Kuala Lumpur Intl (KLIA)', 'KLIA', 'KLIA', 'KLIA'), city: 'kl', lat: 2.7456, lon: 101.7072, board: link('official', 'https://www.malaysiaairports.com.my/kl-international-airport/flight-information', 'MAHB'), live: 'https://www.flightaware.com/live/airport/WMKK' },
        { iata: 'PEN', name: L('槟城国际机场', 'Penang Intl', 'Penang', 'ปีนัง', 'Penang'), city: 'penang', lat: 5.2971, lon: 100.2769, board: link('official', 'https://www.malaysiaairports.com.my/penang-international-airport', 'MAHB'), live: 'https://www.flightaware.com/live/airport/WMKP' },
        { iata: 'BKI', name: L('亚庇国际机场', 'Kota Kinabalu Intl', 'Kota Kinabalu', 'โกตากินาบาลู', 'Kota Kinabalu'), city: 'kotakinabalu', lat: 5.9370, lon: 116.0512, board: link('official', 'https://www.malaysiaairports.com.my/kota-kinabalu-international-airport', 'MAHB'), live: 'https://www.flightaware.com/live/airport/WBKK' },
        { iata: 'JHB', name: L('士乃国际机场', 'Senai Intl (Johor)', 'Senai (Johor)', 'เซไน (ยะโฮร์)', 'Senai (Johor)'), city: 'johor', lat: 1.6410, lon: 103.6699, board: link('public', 'https://www.flightaware.com/live/airport/WMKJ', ''), live: 'https://www.flightaware.com/live/airport/WMKJ' }
      ],
      airlines: [
        { code: 'MH', name: L('马来西亚航空', 'Malaysia Airlines', 'Malaysia Airlines', 'มาเลเซียแอร์ไลน์', 'Malaysia Airlines'), url: 'https://www.malaysiaairlines.com/' },
        { code: 'AK', name: L('亚洲航空', 'AirAsia', 'AirAsia', 'แอร์เอเชีย', 'AirAsia'), url: 'https://www.airasia.com/' },
        { code: 'OD', name: L('马印航空', 'Batik Air Malaysia', 'Batik Air Malaysia', 'บาติกแอร์', 'Batik Air Malaysia'), url: 'https://www.batikair.com/' }
      ]
    },
    {
      id: 'id', iso: 'ID', flag: '🇮🇩', tz: 'Asia/Jakarta', utc: 'GMT+7',
      dial: '+62', emergency: { police: '110', ambulance: '119', fire: '113' },
      name: L('印度尼西亚', 'Indonesia', 'Indonesia', 'อินโดนีเซีย', 'Indonesia'),
      capital: L('雅加达', 'Jakarta', 'Jakarta', 'จาการ์ตา', 'Jakarta'),
      intro: L('11–3 月雨季，雅加达内涝频发；爪哇、巴厘岛山区需留意滑坡，部分地区有火山灰影响航班。',
        'Rainy season Nov–Mar; Jakarta floods frequently. Landslide risk in Java/Bali highlands; volcanic ash can affect flights.',
        'Mùa mưa tháng 11–3; Jakarta thường ngập. Vùng núi Java/Bali có nguy cơ sạt lở, tro núi lửa có thể ảnh hưởng bay.',
        'ฤดูฝน พ.ย.–มี.ค. จาการ์ตาน้ำท่วมบ่อย เสี่ยงดินถล่มในที่สูงชวา/บาหลี เถ้าภูเขาไฟอาจกระทบการบิน',
        'Musim hujan Nov–Mar; Jakarta sering banjir. Risiko longsor di dataran tinggi Jawa/Bali, abu vulkanik dapat mengganggu penerbangan.'),
      tips: [
        L('雅加达暴雨时市区积水与堵车叠加，苏加诺-哈达机场建议提前 3.5 小时出发。',
          'Jakarta rain + gridlock: leave 3.5 hours before departure from Soekarno-Hatta.',
          'Mưa lớn tại Jakarta cộng ùn tắc: nên ra sân bay Soekarno-Hatta trước 3,5 giờ.',
          'ฝนตกหนักจาการ์ตา + รถติด ออกเดินทางไปสนามบินซูการ์โน-ฮัตตาล่วงหน้า 3.5 ชม.',
          'Hujan deras Jakarta + macet: berangkat 3,5 jam sebelum penerbangan dari Soekarno-Hatta.'),
        L('巴厘岛及爪哇山区雨天道路易滑坡；火山灰预警会临时关闭机场，登机前查 BMKG 与航司。',
          'Wet mountain roads in Bali/Java are landslide-prone; volcanic ash advisories can close airports — check BMKG and your airline.',
          'Đường núi Bali/Java dễ sạt lở khi mưa; cảnh báo tro núi lửa có thể đóng sân bay — kiểm tra BMKG và hãng bay.',
          'ถนนบนเขาบาหลี/ชวาเสี่ยงดินถล่ม เตือนเถ้าภูเขาไฟอาจปิดสนามบิน ตรวจสอบ BMKG และสายการบิน',
          'Jalan pegunungan Bali/Jawa rawan longsor; peringatan abu vulkanik dapat menutup bandara — cek BMKG dan maskapai.')
      ],
      controls: [
        { id: 'ID-BNPB', kind: 'gov', label: L('国家抗灾署 · 灾情与道路管制', 'BNPB · disaster & road control reports', 'BNPB · báo cáo thiên tai & đường', 'BNPB · รายงานภัยพิบัติและถนน', 'BNPB · laporan bencana & jalan'), url: 'https://bnpb.go.id/' },
        { id: 'ID-BMKG', kind: 'wx', label: L('气象气候地球物理局 · 极端天气预警', 'BMKG · extreme weather warnings', 'BMKG · cảnh báo thời tiết cực đoan', 'BMKG · เตือนอากาศรุนแรง', 'BMKG · peringatan cuaca ekstrem'), url: 'https://www.bmkg.go.id/' },
        { id: 'ID-HUBDAT', kind: 'road', label: L('交通部陆路运输总局 · 道路与渡轮', 'Directorate of Land Transport · roads & ferries', 'Tổng cục Đường bộ · đường & phà', 'กรมการขนส่งทางบก · ถนนและเรือข้ามฟาก', 'Ditjen Perhubungan Darat · jalan & feri'), url: 'https://www.dephub.go.id/' }
      ],
      sources: [
        { id: 'ID-BMKG', label: L('印尼气象气候地球物理局 BMKG', 'BMKG · Agency for Meteorology, Climatology & Geophysics', 'BMKG · Cơ quan Khí tượng Khí hậu', 'BMKG · กรมอุตุนิยมวิทยา', 'BMKG · Badan Meteorologi'), url: 'https://www.bmkg.go.id/', kind: 'wx' },
        { id: 'ID-CUACA', label: L('BMKG 逐小时天气', 'BMKG · hourly weather', 'BMKG · Thời tiết theo giờ', 'BMKG · สภาพอากาศรายชั่วโมง', 'BMKG · Cuaca per jam'), url: 'https://cuaca.bmkg.go.id/', kind: 'wx' },
        { id: 'ID-BNPB', label: L('国家抗灾署 BNPB · 灾情通报', 'BNPB · disaster bulletins', 'BNPB · Tin thiên tai', 'BNPB · ข่าวภัยพิบัติ', 'BNPB · Info bencana'), url: 'https://www.bnpb.go.id/', kind: 'gov' }
      ],
      cities: [
        { id: 'jakarta', name: L('雅加达', 'Jakarta', 'Jakarta', 'จาการ์ตา', 'Jakarta'), lat: -6.2088, lon: 106.8456, airport: 'CGK', flood: true, coastal: true, island: false, mountain: false },
        { id: 'bali', name: L('巴厘岛 / 登巴萨', 'Bali / Denpasar', 'Bali / Denpasar', 'บาหลี / เดนปาซาร์', 'Bali / Denpasar'), lat: -8.6705, lon: 115.2126, airport: 'DPS', flood: true, coastal: true, island: true, mountain: false },
        { id: 'surabaya', name: L('泗水', 'Surabaya', 'Surabaya', 'สุราบายา', 'Surabaya'), lat: -7.2575, lon: 112.7521, airport: 'SUB', flood: true, coastal: true, island: false, mountain: false },
        { id: 'yogyakarta', name: L('日惹', 'Yogyakarta', 'Yogyakarta', 'ยอกยาการ์ตา', 'Yogyakarta'), lat: -7.7956, lon: 110.3695, airport: 'YIA', flood: false, coastal: false, island: false, mountain: true }
      ],
      airports: [
        { iata: 'CGK', name: L('苏加诺-哈达国际机场', 'Soekarno-Hatta Intl', 'Soekarno-Hatta', 'ซูการ์โน-ฮัตตา', 'Soekarno-Hatta'), city: 'jakarta', lat: -6.1256, lon: 106.6558, board: link('official', 'https://www.angkasapura2.co.id/', 'AP II'), live: 'https://www.flightaware.com/live/airport/WIII' },
        { iata: 'DPS', name: L('伍拉·赖国际机场（巴厘）', 'Ngurah Rai Intl (Bali)', 'Ngurah Rai (Bali)', 'งูระห์ไร (บาหลี)', 'Ngurah Rai (Bali)'), city: 'bali', lat: -8.7482, lon: 115.1672, board: link('official', 'https://www.angkasapura1.co.id/', 'AP I'), live: 'https://www.flightaware.com/live/airport/WADD' },
        { iata: 'SUB', name: L('朱安达国际机场', 'Juanda Intl (Surabaya)', 'Juanda (Surabaya)', 'จวนดา (สุราบายา)', 'Juanda (Surabaya)'), city: 'surabaya', lat: -7.3798, lon: 112.7869, board: link('official', 'https://www.angkasapura1.co.id/', 'AP I'), live: 'https://www.flightaware.com/live/airport/WARR' },
        { iata: 'YIA', name: L('日惹国际机场', 'Yogyakarta Intl', 'Yogyakarta', 'ยอกยาการ์ตา', 'Yogyakarta'), city: 'yogyakarta', lat: -7.9010, lon: 110.0573, board: link('public', 'https://www.flightaware.com/live/airport/WAHI', ''), live: 'https://www.flightaware.com/live/airport/WAHI' }
      ],
      airlines: [
        { code: 'GA', name: L('印尼鹰航', 'Garuda Indonesia', 'Garuda Indonesia', 'การูดา อินโดนีเซีย', 'Garuda Indonesia'), url: 'https://www.garuda-indonesia.com/' },
        { code: 'JT', name: L('狮航', 'Lion Air', 'Lion Air', 'ไลอ้อนแอร์', 'Lion Air'), url: 'https://www.lionair.co.id/' },
        { code: 'ID', name: L('印尼峇迪航空', 'Batik Air', 'Batik Air', 'บาติกแอร์', 'Batik Air'), url: 'https://www.batikair.com/' }
      ]
    },
    {
      id: 'ph', iso: 'PH', flag: '🇵🇭', tz: 'Asia/Manila', utc: 'GMT+8',
      dial: '+63', emergency: { police: '911', ambulance: '911', fire: '911' },
      name: L('菲律宾', 'Philippines', 'Philippines', 'ฟิลิปปินส์', 'Filipina'),
      capital: L('马尼拉', 'Manila', 'Manila', 'มะนิลา', 'Manila'),
      intro: L('6–11 月为台风季，PAGASA 发布风球信号；台风期间国内航班、渡轮与岛间船班大面积取消。',
        'Typhoon season Jun–Nov; PAGASA issues wind signals. Domestic flights and inter-island ferries are widely cancelled during storms.',
        'Mùa bão tháng 6–11; PAGASA phát tín hiệu gió. Chuyến bay nội địa và phà liên đảo thường bị hủy khi có bão.',
        'ฤดูพายุ มิ.ย.–พ.ย. PAGASA ออกสัญญาณลม เที่ยวบินในประเทศและเรือข้ามเกาะถูกยกเลิกจำนวนมาก',
        'Musim topan Jun–Nov; PAGASA mengeluarkan sinyal angin. Penerbangan domestik dan feri antar pulau banyak dibatalkan.'),
      tips: [
        L('台风信号 3 号及以上时，长滩岛/宿务的岛间船班大概率停航，务必预留改签空间。',
          'At wind signal No. 3+, inter-island ferries (Boracay/Cebu) are likely suspended — keep flexible rebooking options.',
          'Từ tín hiệu bão số 3, phà liên đảo (Boracay/Cebu) nhiều khả năng ngưng; chuẩn bị phương án đổi vé.',
          'สัญญาณลมหมายเลข 3 ขึ้นไป เรือข้ามเกาะโบราไค/เซบูมีโอกาสระงับสูง เผื่อแผนเปลี่ยนตั๋ว',
          'Sinyal angin No. 3+ kemungkinan menghentikan feri antar pulau (Boracay/Cebu); siapkan opsi ubah tiket.'),
        L('马尼拉暴雨时 EDSA 主干道严重拥堵，NAIA 机场建议提前 4 小时出发。',
          'Manila heavy rain causes severe EDSA gridlock — leave 4 hours before NAIA departures.',
          'Mưa lớn tại Manila gây ùn tắc EDSA; nên đi đến NAIA trước 4 giờ.',
          'ฝนตกหนักมะนิลาทำให้ EDSA ติดขัดหนัก ออกเดินทางไป NAIA ล่วงหน้า 4 ชม.',
          'Hujan deras Manila memacetkan EDSA; berangkat 4 jam sebelum penerbangan dari NAIA.')
      ],
      controls: [
        { id: 'PH-DPWH', kind: 'road', label: L('公共工程与公路部 · 封路通告', 'DPWH · road closure notices', 'DPWH · thông báo đóng đường', 'DPWH · ประกาศปิดถนน', 'DPWH · pengumuman penutupan jalan'), url: 'https://www.dpwh.gov.ph/' },
        { id: 'PH-MARINA', kind: 'marine', label: L('海事工业局 · 停航与港口通告', 'MARINA · port & sailing notices', 'MARINA · thông báo cảng & tàu', 'MARINA · ประกาศท่าเรือและเดินเรือ', 'MARINA · notisi pelabuhan & pelayaran'), url: 'https://marina.gov.ph/' },
        { id: 'PH-CAAP', kind: 'aviation', label: L('民航局 · 机场与空域通告', 'CAAP · airport & airspace notices', 'CAAP · thông báo sân bay', 'CAAP · ประกาศสนามบิน', 'CAAP · notisi bandara'), url: 'https://caap.gov.ph/' },
        { id: 'PH-NDRRMC', kind: 'gov', label: L('国家减灾管理委员会 · 灾情通报', 'NDRRMC · situation reports', 'NDRRMC · báo cáo tình hình', 'NDRRMC · รายงานสถานการณ์', 'NDRRMC · laporan situasi'), url: 'https://ndrrmc.gov.ph/' }
      ],
      sources: [
        { id: 'PH-PAGASA', label: L('菲律宾大气地球物理和天文管理局 PAGASA', 'PAGASA · Philippine weather & typhoon bureau', 'PAGASA · Cơ quan Khí tượng Philippines', 'PAGASA · กรมอุตุนิยมวิทยาฟิลิปปินส์', 'PAGASA · Badan Cuaca Filipina'), url: 'https://www.pagasa.dost.gov.ph/', kind: 'wx' },
        { id: 'PH-NDRRMC', label: L('国家减灾管理委员会 NDRRMC', 'NDRRMC · disaster management council', 'NDRRMC · Hội đồng giảm nhẹ thiên tai', 'NDRRMC · สภาป้องกันภัย', 'NDRRMC · Dewan Penanggulangan Bencana'), url: 'https://ndrrmc.gov.ph/', kind: 'gov' },
        { id: 'PH-MIAA', label: L('马尼拉国际机场管理局 MIAA · 通告', 'MIAA · airport notices', 'MIAA · Thông báo sân bay', 'MIAA · ประกาศสนามบิน', 'MIAA · Pengumuman bandara'), url: 'https://www.miaa.gov.ph/', kind: 'aviation' }
      ],
      cities: [
        { id: 'manila', name: L('马尼拉', 'Manila', 'Manila', 'มะนิลา', 'Manila'), lat: 14.5995, lon: 120.9842, airport: 'MNL', flood: true, coastal: true, island: false, mountain: false },
        { id: 'cebu', name: L('宿务', 'Cebu', 'Cebu', 'เซบู', 'Cebu'), lat: 10.3157, lon: 123.8854, airport: 'CEB', flood: true, coastal: true, island: true, mountain: false },
        { id: 'davao', name: L('达沃', 'Davao', 'Davao', 'ดาเวา', 'Davao'), lat: 7.1907, lon: 125.4553, airport: 'DVO', flood: false, coastal: true, island: false, mountain: false },
        { id: 'boracay', name: L('长滩岛', 'Boracay', 'Boracay', 'โบราไค', 'Boracay'), lat: 11.9674, lon: 121.9248, airport: 'MPH', flood: false, coastal: true, island: true, mountain: false }
      ],
      airports: [
        { iata: 'MNL', name: L('尼诺伊·阿基诺国际机场 NAIA', 'Ninoy Aquino Intl (NAIA)', 'NAIA', 'NAIA', 'NAIA'), city: 'manila', lat: 14.5086, lon: 121.0198, board: link('official', 'https://www.miaa.gov.ph/', 'MIAA'), live: 'https://www.flightaware.com/live/airport/RPLL' },
        { iata: 'CEB', name: L('麦克坦-宿务国际机场', 'Mactan-Cebu Intl', 'Mactan-Cebu', 'แมคทัน-เซบู', 'Mactan-Cebu'), city: 'cebu', lat: 10.3075, lon: 123.9790, board: link('public', 'https://www.flightaware.com/live/airport/RPVM', ''), live: 'https://www.flightaware.com/live/airport/RPVM' },
        { iata: 'DVO', name: L('达沃国际机场', 'Davao Intl', 'Davao', 'ดาเวา', 'Davao'), city: 'davao', lat: 7.1253, lon: 125.6458, board: link('public', 'https://www.flightaware.com/live/airport/RPMD', ''), live: 'https://www.flightaware.com/live/airport/RPMD' },
        { iata: 'MPH', name: L('卡蒂克兰机场（长滩岛）', 'Caticlan / Godofredo Ramos (Boracay)', 'Caticlan (Boracay)', 'คาติคลัน (โบราไค)', 'Caticlan (Boracay)'), city: 'boracay', lat: 11.9247, lon: 121.9542, board: link('public', 'https://www.flightaware.com/live/airport/RPVE', ''), live: 'https://www.flightaware.com/live/airport/RPVE' }
      ],
      airlines: [
        { code: 'PR', name: L('菲律宾航空', 'Philippine Airlines', 'Philippine Airlines', 'ฟิลิปปินส์แอร์ไลน์', 'Philippine Airlines'), url: 'https://www.philippineairlines.com/' },
        { code: '5J', name: L('宿务太平洋航空', 'Cebu Pacific', 'Cebu Pacific', 'เซบูแปซิฟิก', 'Cebu Pacific'), url: 'https://www.cebupacificair.com/' },
        { code: 'Z2', name: L('菲律宾亚洲航空', 'Philippines AirAsia', 'Philippines AirAsia', 'แอร์เอเชียฟิลิปปินส์', 'Philippines AirAsia'), url: 'https://www.airasia.com/' }
      ]
    }
  ];


  // 旧「东南亚供应链天灾预警看板」的四级口径（仅作定义参照，本站不沿用其 PO/在险件数算法）
  var LEGACY_LEVELS = [
    { level: 3, key: 'red', delayDays: 10, deterioration: 85, nameKey: 'def.legacy.redName', ruleKey: 'def.legacy.redRule' },
    { level: 2, key: 'orange', delayDays: 5, deterioration: 60, nameKey: 'def.legacy.orangeName', ruleKey: 'def.legacy.orangeRule' },
    { level: 1, key: 'yellow', delayDays: 2, deterioration: 35, nameKey: 'def.legacy.yellowName', ruleKey: 'def.legacy.yellowRule' },
    { level: 0, key: 'green', delayDays: 0, deterioration: 0, nameKey: 'def.legacy.greenName', ruleKey: 'def.legacy.greenRule' }
  ];

  // 风险阈值（单位固定，口径公开写在页面上，便于复核）
  var THRESHOLDS = {
    rain: { watch: 2, alert: 8, critical: 20 },        // mm / 小时
    rain24: { watch: 30, alert: 80, critical: 150 },   // mm / 前 24 小时累计
    gust: { watch: 35, alert: 50, critical: 75 },      // km/h
    visibility: { watch: 3000, alert: 1000 },          // m，越小越差
    heat: 35,                                          // °C
    thunderCodes: [95, 96, 99],
    peakHours: [[7, 9], [17, 19]],
    nightHours: [[22, 24], [0, 5]]
  };

  root.SEA_DATA = {
    version: '2.0.0',
    languages: ['zh', 'en', 'vi', 'th', 'id'],
    countries: COUNTRIES,
    thresholds: THRESHOLDS,
    legacyLevels: LEGACY_LEVELS,
    // 航班数据提供方：默认关闭（免 Key 模式）；配置 Key 后由本机每日任务启用，前端永不接触密钥
    flightProvider: {
      mode: 'off',
      supported: ['variflight-mcp', 'aviationstack'],
      note: 'Real flight-status APIs require an account/key. Keys live only in the local updater environment, never in front-end files.'
    }
  };
})(window);

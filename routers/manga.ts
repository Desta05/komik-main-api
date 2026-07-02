import { Router, Request, Response } from "express";
const router = Router();
import cheerio from "cheerio";
import { baseUrl, baseApi } from "../constants/urls";
const replaceMangaPage = "https://komiku.org/manga/";
import AxiosService from "../helpers/axiosService";
import type {
  MangaListItem,
  GenreItem,
  PopularItem,
  RecommendedItem,
  ManhuaManhwaItem,
} from "../types";

router.get("/manga/popular", async (_req: Request, res: Response) => {
  res.send({
    message: "nothing",
  });
});

router.get("/manga/page/:pagenumber", async (req: Request, res: Response) => {
  let pagenumber = req.params.pagenumber;

  // KITA UBAH SEMENTARA: Langsung tembak halaman depan webnya
  let url = "https://mangaku.guru/";

  try {
    const response = await AxiosService(url);
    if (response.status === 200) {
      const $ = cheerio.load(response.data as string);

      // Cek elemen apa saja yang tersedia di halaman tersebut
      console.log("Struktur Kelas yang ada di halaman ini: ");
      $("[class]").each((i, el) => {
        console.log($(el).attr("class"));
      });

      const element = $(".mk-card");

      // MATA-MATA: Kita cetak di terminal berapa banyak elemen yang ditangkap
      console.log("Mencari di URL: ", url);
      console.log("Jumlah komik ditemukan: ", element.length);
      console.log("HTML Body Preview: ", $.html().substring(0, 500));
      console.log("Apakah #Sinopsis ketemu?", $("#Sinopsis").length);
      console.log("Apakah #Daftar_Chapter ketemu?", $("#Daftar_Chapter").length);

      let manga_list: MangaListItem[] = [];
      let title: string, type: string, updated_on: string, endpoint: string, thumb: string, chapter: string;

      element.each((_idx, el) => {
        endpoint = $(el).attr("href")?.replace(replaceMangaPage, "") ?? "";

        // PERHATIKAN: Sekarang menggunakan dua garis bawah (__)
        title = $(el).find(".mk-card__title").text().trim();
        thumb = $(el).find(".mk-card__cover img").attr("src") ?? "";
        type = $(el).find(".mk-badge--tipe").text().trim();
        chapter = $(el)
          .find(".mk-card__meta")
          .contents()
          .map((i, child) => $(child).text().trim())
          .get()
          .filter(Boolean)
          .join(" ");

        updated_on = "";

        if (title !== "") {
          manga_list.push({
            title,
            thumb,
            type,
            updated_on,
            endpoint,
            chapter,
          });
        }
      });
      // ... (lanjutan return res.status(200)...)
      return res.status(200).json({
        status: true,
        message: "success",
        manga_list,
      });
    }
    return res.send({
      message: response.status,
      manga_list: [],
    });
  } catch (err) {
    console.log(err);
    res.send({
      status: false,
      message: err,
      manga_list: [],
    });
  }
});

router.get("/manga/detail/:slug", async (req: Request, res: Response) => {
  const slug = req.params.slug;

  try {
    const response = await AxiosService(`/komik/${slug}`);
    const $ = cheerio.load(response.data as string);

    let obj: Record<string, any> = {};

    // 1. Ambil Judul & Gambar
    const article = $("article.mk-series");
    obj.title = article.attr("data-series-title");
    obj.thumb = article.attr("data-series-cover");

    // 2. Ambil Sinopsis
    obj.synopsis = $("#Sinopsis .mk-prose p").text().trim();

    // 3. Ambil Daftar Chapter
    let chapter_list: { chapter_title: string; chapter_endpoint: string }[] = [];

    $("#Chapter_List a").each((_index, el) => {
      let chapter_title = $(el)
        .contents()
        .map((i, child) => $(child).text().trim())
        .get()
        .filter(Boolean)
        .join(" | ");

      let chapter_endpoint = $(el).attr("href");

      if (chapter_endpoint) {
        // BUNGKUS URL ASLI: Mengubah URL menjadi Base64 agar aman dibawa oleh Flutter
        let encodedEndpoint = Buffer.from(chapter_endpoint).toString('base64url');

        chapter_list.push({
          chapter_title,
          chapter_endpoint: encodedEndpoint,
        });
      }
    });
    obj.chapter = chapter_list;

    // 4. Ambil Data Ekstra (Genre, Status, Rating, Views)
    let genres: string[] = [];
    $(".mgen a, .seriestugenre a, .infox .genre a, .mk-series__genres a").each((_idx, el) => {
      let genreName = $(el).text().trim();
      if (genreName) genres.push(genreName);
    });
    obj.genres = genres;

    let status = $(".imptdt:contains('Status') i, .tsinfo .status, .infox .status").first().text().trim();
    if (!status) {
      const statusText = $(".spe span:contains('Status'), .infox .fmed:contains('Status')").first().text();
      status = statusText.replace("Status:", "").trim();
    }
    if (!status) status = $(".mk-series__eyebrow-link").text().trim();
    obj.status = status || "Unknown";

    let rating = $(".rating .num, .num[itemprop='ratingValue'], .rtg .num").first().text().trim();
    obj.rating = rating || "N/A";

    let views = "";
    $(".ts-views.count, .imptdt:contains('Views') i, .imptdt:contains('Dilihat') i").each((_idx, el) => {
      views = $(el).text().trim();
    });
    obj.views = views || "-";

    // 5. Tambahan Author, Artist, Type
    let author = $(".imptdt:contains('Author') i, .tsinfo .author, .infox .author").first().text().trim();
    if (!author) {
      const authorText = $(".spe span:contains('Pengarang'), .spe span:contains('Author'), .infox .fmed:contains('Author')").first().text();
      author = authorText.replace(/Pengarang:|Author:/i, "").trim();
    }
    if (!author) author = $(".mk-series__author strong").text().trim();
    obj.author = author || "Unknown";

    let artist = $(".imptdt:contains('Artist') i, .tsinfo .artist, .infox .artist").first().text().trim();
    if (!artist) {
      const artistText = $(".spe span:contains('Artis'), .spe span:contains('Artist'), .infox .fmed:contains('Artist')").first().text();
      artist = artistText.replace(/Artis:|Artist:/i, "").trim();
    }
    if (!artist) artist = $(".mk-series__author strong").text().trim(); // Fallback ke author jika tidak ada
    obj.artist = artist || "Unknown";

    let type = $(".imptdt:contains('Type') i, .imptdt:contains('Tipe') i, .tsinfo .type, .infox .type").first().text().trim();
    if (!type) {
      const typeText = $(".spe span:contains('Tipe'), .spe span:contains('Type'), .infox .fmed:contains('Type')").first().text();
      type = typeText.replace(/Tipe:|Type:/i, "").trim();
    }
    if (!type) type = $(".mk-series__eyebrow-tipe").text().replace(/[^a-zA-Z]/g, "").trim();
    obj.type = type || "Unknown";

    res.status(200).send(obj);
  } catch (error) {
    console.log(error);
    res.status(500).send({ status: false, message: "Gagal mengambil detail" });
  }
});



router.get("/search/", async (req: Request, res: Response) => {
  const query = req.query.q as string;
  const url = baseApi + `?post_type=manga&s=${query}`;

  try {
    const response = await AxiosService(url);
    const $ = cheerio.load(response.data as string);
    const element = $(".bge");
    let manga_list: MangaListItem[] = [];
    let title: string, thumb: string, type: string, endpoint: string, updated_on: string;
    element.each((_idx, el) => {
      endpoint = $(el)
        .find("a")
        .attr("href")
        ?.replace(replaceMangaPage, "")
        .replace("/manga/", "") ?? "";
      thumb = $(el).find("div.bgei > a > img").attr("data-src") ?? "";
      type = $(el).find("div.bgei > a > div.tpe1_inf > b").text();
      title = $(el).find(".kan").find("h3").text().trim();
      updated_on = $(el).find("div.kan > p").text().split(".")[0]?.trim() ?? "";
      manga_list.push({
        title,
        thumb,
        type,
        endpoint,
        updated_on,
      });
    });
    res.json({
      status: true,
      message: "success",
      manga_list,
    });
  } catch (error) {
    res.send({
      status: false,
      message: error instanceof Error ? error.message : error,
    });
  }
});

router.get("/genres", async (_req: Request, res: Response) => {
  try {
    const response = await AxiosService();

    const $ = cheerio.load(response.data as string);
    let list_genre: GenreItem[] = [];
    let obj: Record<string, any> = {};
    $("#Filter > form > select:nth-child(4)")
      .find("option")
      .each((_idx, el) => {
        if ($(el).text() !== "Genre 1") {
          const endpoint = $(el)
            .text()
            .trim()
            .split(" ")[0]
            .toLowerCase();
          list_genre.push({
            genre_name: $(el).text().trim(),
            endpoint,
          });
        }
      });
    obj.status = true;
    obj.message = "success";
    obj.list_genre = list_genre;
    res.json(obj);
  } catch (error) {
    res.send({
      status: false,
      message: error,
    });
  }
});

router.get("/genres/:slug/:pagenumber", async (req: Request, res: Response) => {
  const slug = req.params.slug;
  const pagenumber = req.params.pagenumber;
  const path =
    pagenumber === "1"
      ? `/genre/${slug}/?orderby=modified&genre2&status&category_name`
      : `/manga/page/${pagenumber}/?orderby=modified&category_name&genre=${slug}&genre2&status`;
  const url = baseApi + path;

  try {
    const response = await AxiosService(url);
    const $ = cheerio.load(response.data as string);
    const element = $(".bge");
    let thumb: string, title: string, endpoint: string, type: string;
    let manga_list: MangaListItem[] = [];
    element.each((_idx, el) => {
      title = $(el).find(".kan").find("h3").text().trim();
      endpoint = $(el).find("a").attr("href")?.replace(replaceMangaPage, "") ?? "";
      type = $(el).find("div.bgei > a > div").find("b").text();
      thumb = $(el).find("div.bgei > a > img").attr("src") ?? "";
      manga_list.push({
        title,
        type,
        thumb,
        endpoint,
        updated_on: "",
      });
    });
    res.json({
      status: true,
      message: "success",
      manga_list,
    });
  } catch (error) {
    res.send({
      status: false,
      message: error,
      manga_list: [],
    });
  }
});

router.get("/manga/popular/:pagenumber", async (req: Request, res: Response) => {
  const pagenumber = req.params.pagenumber;
  const path =
    pagenumber === "1"
      ? `/other/rekomendasi/`
      : `/other/rekomendasi/page/${pagenumber}/`;
  const url = baseApi + path;

  try {
    const response = await AxiosService(url);
    const $ = cheerio.load(response.data as string);
    const element = $(".bge");
    let thumb: string, title: string, endpoint: string, type: string, upload_on: string, sortDesc: string;
    let manga_list: PopularItem[] = [];
    element.each((_idx, el) => {
      title = $(el).find(".kan").find("h3").text().trim();
      endpoint = $(el)
        .find("a")
        .attr("href")
        ?.replace(replaceMangaPage, "")
        .replace("/manga/", "") ?? "";
      type = $(el).find("div.bgei > a > div.tpe1_inf > b").text();
      thumb = $(el).find("div.bgei > a > img").attr("src") ?? "";
      sortDesc = $(el).find("div.kan > p").text().trim();
      upload_on = $(el).find("div.kan > span.judul2").text().split("•")[1]?.trim() ?? "";
      manga_list.push({
        title,
        type,
        thumb,
        endpoint,
        upload_on,
        sortDesc
      });
    });
    res.json({
      status: true,
      message: "success",
      manga_list,
    });
  } catch (error) {
    res.send({
      status: false,
      message: error,
      manga_list: [],
    });
  }
});

router.get("/recommended/:pagenumber", async (req: Request, res: Response) => {
  const pagenumber = req.params.pagenumber;
  const path =
    pagenumber === "1"
      ? `/other/hot/`
      : `/other/hot/page/${pagenumber}/`;
  const url = baseApi + path;
  try {
    const response = await AxiosService(url);

    const $ = cheerio.load(response.data as string);
    const element = $(".bge");
    let manga_list: RecommendedItem[] = [];
    element.each((_idx, el) => {
      const title = $(el).find("div.kan > a > h3").text().trim();
      const thumb = $(el).find("div.bgei > a > img").attr("src") ?? "";
      const endpoint = $(el)
        .find("div.kan > a")
        .attr("href")
        ?.replace("/manga/", "")
        .replace(replaceMangaPage, "") ?? "";
      manga_list.push({
        title,
        chapter: undefined,
        type: undefined,
        thumb,
        endpoint,
        update: undefined,
      });
    });
    return res.json({
      status: true,
      message: "success",
      manga_list,
    });
  } catch (error) {
    res.send({
      message: error instanceof Error ? error.message : error,
    });
  }
});

router.get("/manhua/page/:pagenumber", async (req: Request, res: Response) => {
  await getManhuaManhwa(req, res, "manhua");
});

router.get("/manhwa/page/:pagenumber", async (req: Request, res: Response) => {
  await getManhuaManhwa(req, res, "manhwa");
});

const getManhuaManhwa = async (req: Request, res: Response, type: string) => {
  let pagenumber = req.params.pagenumber;
  let path =
    pagenumber === "1"
      ? `/manga/?orderby=&category_name=${type}&genre=&genre2=&status=`
      : `/manga/page/${pagenumber}/?orderby&category_name=${type}&genre&genre2&status`;
  const url = baseApi + path;
  try {
    console.log(url);
    const response = await AxiosService(url);
    const $ = cheerio.load(response.data as string);
    const element = $(".bge");
    const manga_list: ManhuaManhwaItem[] = [];
    let title: string, updated_on: string, endpoint: string, thumb: string, chapter: string;

    element.each((_idx, el) => {
      title = $(el).find(".kan > a").find("h3").text().trim();
      endpoint = $(el).find("a").attr("href")?.replace(replaceMangaPage, "") ?? "";
      type = $(el).find(".bgei > a").find(".tpe1_inf > b").text().trim();
      updated_on = $(el).find(".kan > span").text().split("• ")[1]?.trim() ?? "";
      thumb = $(el).find(".bgei > a").find("img").attr("src") ?? "";
      chapter = $(el)
        .find("div.kan > div:nth-child(5) > a > span:nth-child(2)")
        .text();
      manga_list.push({
        title,
        thumb,
        type,
        updated_on,
        endpoint,
        chapter,
      });
    });

    res.status(200).json({
      status: true,
      message: "success",
      manga_list,
    });
  } catch (error) {
    console.log(error);
    res.send({
      status: false,
      message: error,
      manga_list: [],
    });
  }
};

router.get("/manga/chapter/:endpoint", async (req: Request, res: Response) => {
  const endpoint = req.params.endpoint;

  try {
    // BUKA BUNGKUSAN: Mengembalikan teks Base64 menjadi URL aslinya
    const targetUrl = Buffer.from(String(endpoint), 'base64url').toString('utf8');
    console.log(`\n[+] Membuka URL Asli: ${targetUrl}`);

    // Langsung tembak URL aslinya (tanpa perlu kita tebak-tebak lagi)
    const response = await AxiosService(targetUrl);
    const $ = cheerio.load(response.data as string);

    let image_list: string[] = [];

    // Mencari gambar di berbagai kemungkinan nama kelas pembaca komik
    $("#Main_Content img, .mk-reader img, .reader-area img, .main-reading-area img").each((_idx, el) => {
      let src = $(el).attr("src") ?? $(el).attr("data-src") ?? $(el).attr("data-lazy-src");
      if (src && src.trim() !== "") {
        image_list.push(src.trim());
      }
    });

    console.log(`[V] Sukses! Menemukan ${image_list.length} panel gambar.`);

    res.status(200).json({
      status: true,
      message: "success",
      image_list,
    });
  } catch (error: any) {
    console.log("[-] Gagal mengambil chapter:", error.message);
    res.status(500).json({ status: false, message: "Gagal mengambil panel gambar" });
  }
});

// Rute untuk Fitur Pencarian (Search) dengan Paginasi
router.get("/manga/search/:query/:page?", async (req: Request, res: Response) => {
  const query = req.params.query;
  // Jika nomor halaman tidak dikirim, anggap saja halaman 1
  const page = req.params.page || 1;

  // Format URL WP untuk halaman berikutnya
  let targetUrl = `/?s=${query}`;
  if (Number(page) > 1) {
    targetUrl = `/page/${page}/?s=${query}`;
  }

  try {
    console.log(`\n[+] Mencari komik "${query}" (Halaman ${page})`);
    const response = await AxiosService(targetUrl);
    const $ = cheerio.load(response.data as string);

    let manga_list: any[] = [];

    // JARING PRESISI
    $("#Search_Results .mk-grid > *").each((_idx, el) => {
      let title = $(el).find("h1, h2, h3, h4, .title, [class*='title']").text().trim();
      if (!title || title === "") {
        title = $(el).find("a").text().trim();
      }

      let thumb = $(el).find("img").attr("src") ??
        $(el).find("img").attr("data-src") ??
        $(el).find("img").attr("data-lazy-src") ?? "";

      let href = $(el).attr("href") ?? $(el).find("a").attr("href");

      if (title && href && title !== "") {
        let endpoint = href.split("/").filter(Boolean).pop() ?? "";

        manga_list.push({
          title,
          thumb,
          endpoint,
        });
      }
    });

    console.log(`[V] Berhasil menemukan ${manga_list.length} hasil pencarian di halaman ${page}.`);

    res.status(200).json({
      status: true,
      message: "success",
      manga_list,
    });
  } catch (error: any) {
    // Jika situs web aslinya membalas 404 (artinya halamannya sudah habis)
    if (error.response && error.response.status === 404) {
      console.log(`[V] Halaman ${page} tidak ditemukan (Data pencarian habis).`);
      return res.status(200).json({
        status: true,
        message: "Data habis",
        manga_list: [], // Kirim array kosong agar Flutter berhenti nge-scroll
      });
    }

    // Jika error karena alasan lain (misal koneksi putus)
    console.log("[-] Gagal melakukan pencarian:", error.message);
    res.status(500).json({ status: false, message: "Gagal mencari komik" });
  }
});

// Rute untuk Fitur Kategori (Manga, Manhwa, Manhua) dengan Paginasi
router.get("/manga/type/:type/:page?", async (req: Request, res: Response) => {
  const type = String(req.params.type || "").toLowerCase(); // manga, manhwa, atau manhua
  const page = req.params.page || 1;

  // Menggunakan URL penemuanmu: /komik/?tipe=manhwa
  let targetUrl = `/komik/?orderby=update&tipe=${type}`;

  // Jika meminta halaman 2, 3, dst
  if (Number(page) > 1) {
    targetUrl = `/komik/page/${page}/?orderby=update&tipe=${type}`;
  }

  try {
    console.log(`\n[+] Mengambil kategori "${type}" (Halaman ${page})`);
    const response = await AxiosService(targetUrl);
    const $ = cheerio.load(response.data as string);

    let manga_list: any[] = [];

    // JARING SUPER LEBAR 
    $(".bs, .listupd .bsx, .utao .uta, .item, .animepost, .bixbox .bsx, .mk-grid > *").each((_idx, el) => {

      let title = $(el).find("h1, h2, h3, h4, .tt, .title, [class*='title']").text().trim();
      if (!title || title === "") {
        title = $(el).find("a").text().trim();
      }

      let thumb = $(el).find("img").attr("src") ??
        $(el).find("img").attr("data-src") ??
        $(el).find("img").attr("data-lazy-src") ?? "";

      let href = $(el).attr("href") ?? $(el).find("a").attr("href");

      if (title && href && title !== "") {
        let endpoint = href.split("/").filter(Boolean).pop() ?? "";

        manga_list.push({
          title,
          thumb,
          endpoint,
          type: type
        });
      }
    });

    console.log(`[V] Berhasil menemukan ${manga_list.length} komik di kategori ${type}.`);

    res.status(200).json({
      status: true,
      message: "success",
      manga_list,
    });
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      console.log(`[V] Halaman ${page} tidak ditemukan (Kategori habis).`);
      return res.status(200).json({
        status: true,
        message: "Data habis",
        manga_list: [],
      });
    }
    console.log("[-] Gagal mengambil kategori:", error.message);
    res.status(500).json({ status: false, message: "Gagal memuat kategori" });
  }
});

// Rute Sakti untuk Filter, Update Terbaru, dan Jadwal
router.get("/manga/filter/:page?", async (req: Request, res: Response) => {
  const page = req.params.page || 1;

  // Menangkap nilai dari query URL (contoh: ?tipe=manhwa&genre=action)
  const tipe = String(req.query.tipe || "");
  const genre = String(req.query.genre || "");
  const status = String(req.query.status || "");
  const orderby = String(req.query.orderby || "update"); // Default ke update terbaru

  // Merakit URL target ke situs Mangaku
  let targetUrl = `/komik/?orderby=${orderby}&tipe=${tipe}&genre=${genre}&status=${status}`;
  if (Number(page) > 1) {
    targetUrl = `/komik/page/${page}/?orderby=${orderby}&tipe=${tipe}&genre=${genre}&status=${status}`;
  }

  try {
    console.log(`\n[+] Filter Halaman ${page} | Order: ${orderby}, Tipe: ${tipe}, Genre: ${genre}, Status: ${status}`);
    const response = await AxiosService(targetUrl);
    const $ = cheerio.load(response.data as string);

    let manga_list: any[] = [];

    // Menggunakan jaring yang sudah terbukti ampuh di halaman /komik/
    // Kita buang tag #Search_Results agar jaringnya bisa menangkap elemen di halaman /komik/
    $(".bs, .listupd .bsx, .utao .uta, .item, .animepost, .bixbox .bsx, .mk-grid > *").each((_idx, el) => {
      let title = $(el).find("h1, h2, h3, h4, .tt, .title, [class*='title']").text().trim();
      if (!title || title === "") title = $(el).find("a").text().trim();

      let thumb = $(el).find("img").attr("src") ??
        $(el).find("img").attr("data-src") ??
        $(el).find("img").attr("data-lazy-src") ?? "";

      let href = $(el).attr("href") ?? $(el).find("a").attr("href");

      if (title && href && title !== "") {
        let endpoint = href.split("/").filter(Boolean).pop() ?? "";
        manga_list.push({ title, thumb, endpoint });
      }
    });

    console.log(`[V] Berhasil menemukan ${manga_list.length} komik dari filter.`);

    res.status(200).json({
      status: true,
      message: "success",
      manga_list,
    });
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      return res.status(200).json({ status: true, message: "Data habis", manga_list: [] });
    }
    console.log("[-] Gagal mengambil filter:", error.message);
    res.status(500).json({ status: false, message: "Gagal memuat filter" });
  }
});

export default router;

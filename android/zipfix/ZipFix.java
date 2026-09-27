import java.io.*;
import java.util.*;
import java.util.zip.*;

/**
 * 重写 APK：统一 zip 条目分隔符为 '/'（aapt2 在 Windows 下会把子目录写成反斜杠条目），
 * 并把 assets 目录与 classes.dex 追加进包。
 * 用法：java ZipFix <inApk> <outApk> <assetsDir|-> <dexFile|->
 */
public class ZipFix {
    public static void main(String[] args) throws Exception {
        File in = new File(args[0]);
        File out = new File(args[1]);
        File assetsDir = args.length > 2 && !"-".equals(args[2]) ? new File(args[2]) : null;
        File dexFile = args.length > 3 && !"-".equals(args[3]) ? new File(args[3]) : null;
        byte[] buf = new byte[16384];
        try (ZipInputStream zin = new ZipInputStream(new BufferedInputStream(new FileInputStream(in)));
             ZipOutputStream zout = new ZipOutputStream(new BufferedOutputStream(new FileOutputStream(out)))) {
            ZipEntry e;
            while ((e = zin.getNextEntry()) != null) {
                String name = e.getName().replace('\\', '/');
                copyEntry(zout, name, e.getMethod(), e.getTime(), e.getSize(), e.getCrc(), zin, buf);
                zin.closeEntry();
            }
            if (assetsDir != null) {
                List<File> files = new ArrayList<>();
                collect(assetsDir, files);
                for (File f : files) {
                    String rel = assetsDir.toPath().relativize(f.toPath()).toString().replace('\\', '/');
                    copyFile(zout, "assets/" + rel, f, buf);
                }
            }
            if (dexFile != null) copyFile(zout, "classes.dex", dexFile, buf);
        }
        System.out.println("ZipFix done: " + out.getPath());
    }

    private static void copyEntry(ZipOutputStream zout, String name, int method, long time,
                                  long size, long crc, InputStream data, byte[] buf) throws IOException {
        ZipEntry n = new ZipEntry(name);
        n.setMethod(method == ZipEntry.STORED ? ZipEntry.STORED : ZipEntry.DEFLATED);
        n.setTime(time);
        if (n.getMethod() == ZipEntry.STORED) { n.setSize(size); n.setCrc(crc); }
        zout.putNextEntry(n);
        int k;
        while ((k = data.read(buf)) > 0) zout.write(buf, 0, k);
        zout.closeEntry();
    }

    private static void copyFile(ZipOutputStream zout, String name, File f, byte[] buf) throws IOException {
        CRC32 crc = new CRC32();
        long len = f.length();
        try (InputStream fin = new FileInputStream(f)) {
            int k;
            while ((k = fin.read(buf)) > 0) crc.update(buf, 0, k);
        }
        ZipEntry n = new ZipEntry(name);
        n.setMethod(ZipEntry.DEFLATED);
        n.setTime(f.lastModified());
        n.setSize(len);
        n.setCrc(crc.getValue());
        zout.putNextEntry(n);
        try (InputStream fin = new FileInputStream(f)) {
            int k;
            while ((k = fin.read(buf)) > 0) zout.write(buf, 0, k);
        }
        zout.closeEntry();
    }

    static void collect(File d, List<File> out) {
        File[] ls = d.listFiles();
        if (ls == null) return;
        Arrays.sort(ls);
        for (File f : ls) { if (f.isDirectory()) collect(f, out); else out.add(f); }
    }
}

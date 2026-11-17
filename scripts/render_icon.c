// Draw the full X-Ray logo and the small scan-mark from vector shapes.
#include <CoreFoundation/CoreFoundation.h>
#include <CoreGraphics/CoreGraphics.h>
#include <CoreText/CoreText.h>
#include <ImageIO/ImageIO.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static CGColorRef ink, paper, mint;
static CGFloat top_y(CGFloat top) { return 128 - top; }

static CGColorRef color(CGFloat r, CGFloat g, CGFloat b) {
    CGFloat values[] = {r, g, b, 1};
    CGColorSpaceRef space = CGColorSpaceCreateDeviceRGB();
    CGColorRef result = CGColorCreate(space, values);
    CGColorSpaceRelease(space);
    return result;
}

static void rounded(CGContextRef context, CGFloat x, CGFloat top, CGFloat width,
                    CGFloat height, CGFloat radius, CGColorRef fill) {
    CGRect rect = CGRectMake(x, 128 - top - height, width, height);
    CGPathRef path = CGPathCreateWithRoundedRect(rect, radius, radius, NULL);
    CGContextSetFillColorWithColor(context, fill);
    CGContextAddPath(context, path);
    CGContextFillPath(context);
    CGPathRelease(path);
}

static void polygon(CGContextRef context, const CGFloat points[][2], size_t count,
                    CGColorRef fill) {
    CGContextSetFillColorWithColor(context, fill);
    CGContextBeginPath(context);
    CGContextMoveToPoint(context, points[0][0], top_y(points[0][1]));
    for (size_t i = 1; i < count; i++)
        CGContextAddLineToPoint(context, points[i][0], top_y(points[i][1]));
    CGContextClosePath(context);
    CGContextFillPath(context);
}

static void line(CGContextRef context, CGFloat x1, CGFloat y1, CGFloat x2,
                 CGFloat y2, CGFloat width, CGColorRef stroke) {
    CGContextSetStrokeColorWithColor(context, stroke);
    CGContextSetLineWidth(context, width);
    CGContextSetLineCap(context, kCGLineCapRound);
    CGContextMoveToPoint(context, x1, top_y(y1));
    CGContextAddLineToPoint(context, x2, top_y(y2));
    CGContextStrokePath(context);
}

static void wordmark(CGContextRef context) {
    CTFontRef font = CTFontCreateWithName(CFSTR("HelveticaNeue-Bold"), 26, NULL);
    const void *keys[] = {kCTFontAttributeName, kCTForegroundColorAttributeName};
    const void *values[] = {font, ink};
    CFDictionaryRef attributes = CFDictionaryCreate(NULL, keys, values, 2,
        &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    CFAttributedStringRef string = CFAttributedStringCreate(NULL, CFSTR("x-ray"), attributes);
    CTLineRef text = CTLineCreateWithAttributedString(string);
    double width = CTLineGetTypographicBounds(text, NULL, NULL, NULL);
    CGContextSetTextPosition(context, (128 - width) / 2, 24);
    CTLineDraw(text, context);
    CFRelease(text);
    CFRelease(string);
    CFRelease(attributes);
    CFRelease(font);
}

static int render(const char *file, int full) {
    const size_t pixels = 1024;
    CGColorSpaceRef space = CGColorSpaceCreateDeviceRGB();
    CGContextRef context = CGBitmapContextCreate(NULL, pixels, pixels, 8, 0, space,
                                                 kCGImageAlphaPremultipliedLast);
    CGColorSpaceRelease(space);
    if (!context) return 1;
    CGContextScaleCTM(context, 8, 8);

    if (full) {
        // Keep the reference's square, M, download arrow, and x-ray wordmark.
        rounded(context, 3, 3, 122, 122, 22, ink);
        rounded(context, 10, 10, 108, 108, 15, paper);
        rounded(context, 18, 18, 92, 66, 13, ink);
        const CGFloat m[][2] = {{28,68},{28,31},{38,31},{50,48},{62,31},{72,31},
                                 {72,68},{62,68},{62,49},{50,65},{38,49},{38,68}};
        polygon(context, m, 12, paper);
        rounded(context, 84, 31, 10, 27, 2, mint);
        const CGFloat arrow[][2] = {{76,54},{102,54},{89,72}};
        polygon(context, arrow, 3, mint);
        rounded(context, 28, 76, 51, 2.5, 1.2, mint);
        wordmark(context);
    } else {
        // At toolbar size the X and scan beam form a unique silhouette.
        rounded(context, 3, 3, 122, 122, 25, ink);
        line(context, 36, 34, 92, 94, 18, paper);
        line(context, 92, 34, 36, 94, 18, paper);
        line(context, 29, 64, 99, 64, 9, mint);
        rounded(context, 55, 55, 18, 18, 4, ink);
        rounded(context, 61, 61, 6, 6, 2, mint);
    }

    CGImageRef image = CGBitmapContextCreateImage(context);
    CFURLRef url = CFURLCreateFromFileSystemRepresentation(NULL, (const UInt8 *)file,
                                                            (CFIndex)strlen(file), false);
    CGImageDestinationRef writer = CGImageDestinationCreateWithURL(url, CFSTR("public.png"), 1, NULL);
    if (!image || !url || !writer) return 1;
    CGImageDestinationAddImage(writer, image, NULL);
    int success = CGImageDestinationFinalize(writer);
    CFRelease(writer);
    CFRelease(url);
    CGImageRelease(image);
    CGContextRelease(context);
    return !success;
}

int main(int argc, char **argv) {
    if (argc != 2) return 2;
    ink = color(0.065, 0.18, 0.17);
    paper = color(0.97, 0.98, 0.96);
    mint = color(0.66, 0.90, 0.65);
    char path[4096];
    snprintf(path, sizeof(path), "%s/full.png", argv[1]);
    if (render(path, 1)) return 1;
    snprintf(path, sizeof(path), "%s/symbol.png", argv[1]);
    if (render(path, 0)) return 1;
    CGColorRelease(ink);
    CGColorRelease(paper);
    CGColorRelease(mint);
    return 0;
}

import React from 'react';
import { Lock } from 'lucide-react';

export const PrivacyPage = () => {
    return (
        <div className="min-h-screen bg-slate-50 pt-24 pb-16">
            <div className="max-w-4xl mx-auto px-6">

                <div className="bg-white rounded-3xl p-8 md:p-12 shadow-sm border border-slate-200">
                    <div className="flex items-center gap-4 mb-8 pb-8 border-b border-slate-100">
                        <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center shrink-0">
                            <Lock className="w-7 h-7 text-blue-500" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-slate-900 mb-2">سياسة الخصوصية وأمن البيانات</h1>
                            <p className="text-slate-500 font-medium">نلتزم بحماية بياناتك الشخصية والمالية.</p>
                        </div>
                    </div>

                    <div className="prose prose-slate max-w-none prose-headings:font-black prose-headings:text-slate-900 prose-p:text-slate-600 prose-p:leading-relaxed">
                        <p>
                            في منصة أوتو برو، نعتبر خصوصية بياناتك وتأمينها على رأس أولوياتنا. توضح هذه الوثيقة ماهية البيانات التي نجمعها، ولماذا نجمعها، وكيف نقوم بمعالجتها للحفاظ على سرية عملياتك التجارية.
                        </p>

                        <h2>1. البيانات التي نجمعها</h2>
                        <ul>
                            <li><strong>معلومات الهوية:</strong> الاسم الكامل، رقم الهاتف، البريد الإلكتروني، وصورة جواز السفر أو الهوية الوطنية لغرض توثيق الحساب (KYC).</li>
                            <li><strong>سجل التعاملات:</strong> المزايدات، الفواتير، طرق الدفع وعمليات تحويل الأموال.</li>
                            <li><strong>معلومات التتبع:</strong> لتوفير إشعارات موقع الشحنة والرسائل التنبيهية عبر الواتساب.</li>
                        </ul>

                        <h2>2. استخدام البيانات</h2>
                        <p>
                            نستخدم بياناتك لتنفيذ التزاماتنا تجاهك فقط. هذا يشمل توثيق قدرتك المالية أمام المزادات الأمريكية، وشحن السيارة إلى اسم المستخدم الصحيح دون أخطاء جمركية. لا نقوم إطلاقاً ببيع أو تداول بيانات عملائنا أو سجل مشترياتهم لأي طرف ثالث بغرض التسويق.
                        </p>

                        <h2>3. أمن وتشفير المعلومات</h2>
                        <p>
                            جميع العمليات الحساسة وبيانات الفواتير والهويات تتم تخزينها عبر خوادم سحابية محمية بأعلى بروتوكولات التشفير القياسية للمجال المالي السحابي.
                        </p>

                        <h2 id="data-deletion">4. حذف أو إغلاق الحساب (Data Deletion)</h2>
                        <p>
                            يمكنك في أي وقت تقديم طلب للمسؤولين بحذف حسابك نهائياً من منصة أوتو برو وإزالة كافة وثائقك الشخصية، شريطة عدم وجود مستحقات مالية أو فواتير معلقة مرتبطة بالحساب.
                        </p>
                        <p>
                            <strong>كيفية حذف بياناتك:</strong>
                        </p>
                        <ol>
                            <li>أرسل بريداً إلى <a href="mailto:privacy@autopro.ac" className="text-orange-600 font-bold">privacy@autopro.ac</a> من البريد المسجل في حسابك.</li>
                            <li>اكتب في عنوان الرسالة: <strong>"طلب حذف بيانات"</strong> أو <strong>"Data Deletion Request"</strong>.</li>
                            <li>سنقوم بمعالجة طلبك وحذف جميع بياناتك الشخصية خلال <strong>30 يوماً</strong>.</li>
                            <li>ستتلقى تأكيداً بالبريد الإلكتروني عند اكتمال الحذف.</li>
                        </ol>
                        <p>
                            <strong>البيانات التي سيتم حذفها:</strong>
                        </p>
                        <ul>
                            <li>معلومات الحساب الشخصية (الاسم، البريد، الهاتف)</li>
                            <li>وثائق التوثيق (KYC) والصور الشخصية</li>
                            <li>سجل المزايدات والعروض غير المكتملة</li>
                            <li>الرسائل والإشعارات</li>
                            <li>بيانات الربط مع Google / Facebook (إن وُجدت)</li>
                        </ul>
                        <p>
                            <em>ملاحظة: بعض البيانات المالية والقانونية (الفواتير، المزادات المكتملة) قد تُحفظ لمدة 5 سنوات حسب اللوائح الليبية.</em>
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );
};
